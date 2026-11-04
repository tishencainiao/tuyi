#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""途忆 · 记忆消化（轻量版）

把 data/memory/<用户>.json 里的 memories（一轮轮对话抽出来的事实）反思合成为
insights（偏好标签 + 一句话认识），写回同一个文件，供下一次对话注入提示词。

用法（Node 侧会自动触发，也可手动跑）：
    python py/digest.py --user u-xxxx            # 仅在攒够触发数时运行
    python py/digest.py --user u-xxxx --force    # 强制运行（Node 触发时用）

依赖：仅标准库（urllib / json / re），不需要 pip 安装。
"""

import argparse
import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.environ.get('TUYI_DATA_DIR') or os.path.join(ROOT, 'data', 'memory')

DIGEST_PROMPT = """你是记忆消化器。把下面这位用户的历史记忆条目，提炼成「关于这位用户的稳定认识」：
1) tags：3~6 个偏好标签（短词，如 慢节奏、带父母、预算中等、自然风光）；
2) summary：一句话总结这位用户的旅行偏好（不超过 60 字）；
3) confidence：high / medium / low（依据记忆条目的数量与一致性判断）。

只输出 JSON：{"tags":["..."],"summary":"...","confidence":"medium"}，不要输出其他文字。
"""


def load_env():
    """读取项目根目录的 .env（不覆盖已有环境变量）。"""
    path = os.path.join(ROOT, '.env')
    if not os.path.exists(path):
        return
    with open(path, encoding='utf-8') as handle:
        for line in handle:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, value = line.split('=', 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def load_cfg():
    with open(os.path.join(ROOT, 'config.json'), encoding='utf-8') as handle:
        return json.load(handle)


def sanitize(user_id):
    return re.sub(r'[^\w-]', '_', str(user_id))[:64] or 'anonymous'


def load_record(path):
    with open(path, encoding='utf-8') as handle:
        return json.load(handle)


def save_record(path, record):
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as handle:
        json.dump(record, handle, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def build_prompt(record):
    memories = record.get('memories') or []
    old = record.get('insights') or {}
    lines = ['以下是关于同一位用户的历史记忆条目（来自多次对话）：']
    for item in memories[-40:]:
        lines.append('- ' + str(item.get('text', '')))
    if old.get('tags') or old.get('summary'):
        lines.append('')
        lines.append('上一轮已经整理出的认识（可合并更新）：')
        if old.get('tags'):
            lines.append('标签：' + '、'.join(old['tags']))
        if old.get('summary'):
            lines.append('摘要：' + old['summary'])
    return '\n'.join(lines)


def call_llm(cfg, prompt):
    api_key = os.environ.get('DEEPSEEK_API_KEY')
    if not api_key:
        raise RuntimeError('缺少 DEEPSEEK_API_KEY')
    llm = cfg.get('llm') or {}
    base = str(llm.get('base_url') or 'https://api.deepseek.com').rstrip('/')
    if not base.endswith('/v1'):
        base += '/v1'
    url = base + '/chat/completions'
    model = llm.get('model') or 'deepseek-v4-flash'
    body = json.dumps({
        'model': model,
        'messages': [
            {'role': 'system', 'content': DIGEST_PROMPT},
            {'role': 'user', 'content': prompt},
        ],
        'temperature': 0.2,
    }).encode('utf-8')
    request = urllib.request.Request(
        url,
        data=body,
        headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + api_key},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        data = json.loads(response.read().decode('utf-8'))
    return data['choices'][0]['message']['content']


def parse_json(text):
    text = str(text or '').strip()
    text = re.sub(r'^```(?:json)?\s*', '', text)
    text = re.sub(r'\s*```$', '', text)
    start = text.find('{')
    end = text.rfind('}')
    if start < 0 or end <= start:
        raise ValueError('模型没有返回 JSON')
    return json.loads(text[start:end + 1])


def main():
    parser = argparse.ArgumentParser(description='途忆 · 记忆消化')
    parser.add_argument('--user', required=True)
    parser.add_argument('--force', action='store_true', help='忽略触发阈值，强制消化')
    args = parser.parse_args()

    load_env()
    cfg = load_cfg()
    path = os.path.join(DATA_DIR, sanitize(args.user) + '.json')
    if not os.path.exists(path):
        print('[digest] 没有该用户的记忆文件，跳过')
        return 0

    record = load_record(path)
    memories = record.get('memories') or []
    trigger = int((cfg.get('memory') or {}).get('digest_trigger_count', 3))
    since = int((record.get('state') or {}).get('memoriesSinceDigest', 0))
    if not args.force and since < trigger:
        print('[digest] 还没攒够（%d/%d），跳过' % (since, trigger))
        return 0

    try:
        result = parse_json(call_llm(cfg, build_prompt(record)))
    except Exception as exc:  # noqa: BLE001 - 任何失败都不应影响主流程
        print('[digest] 失败：%s' % exc)
        return 1

    tags = [str(tag).strip() for tag in (result.get('tags') or []) if str(tag).strip()][:8]
    summary = str(result.get('summary') or '').strip()[:120]
    confidence = str(result.get('confidence') or 'medium')
    now = datetime.now(timezone.utc).isoformat()
    record['insights'] = {
        'updated': now,
        'tags': tags,
        'summary': summary,
        'confidence': confidence,
        'sourceCount': len(memories),
    }
    state = record.setdefault('state', {})
    state['lastDigestAt'] = now
    state['memoriesSinceDigest'] = 0
    save_record(path, record)
    print('[digest] 完成：' + summary)
    return 0


if __name__ == '__main__':
    sys.exit(main())
