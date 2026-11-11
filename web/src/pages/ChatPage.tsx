import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { App, Button, Input, Spin, Tag } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import { api, chatStream, Itinerary, PlanStatus } from '../api';
import PlanCard from '../components/PlanCard';

interface Msg {
  role: 'user' | 'assistant';
  text: string;
  ts?: string;
  streaming?: boolean;
  error?: boolean;
}

interface ToolState {
  label: string;
  status: 'running' | 'ok' | 'fail';
}

type TimelineItem =
  | { kind: 'msg'; key: string; msg: Msg }
  | { kind: 'plan'; key: string; plan: Itinerary };

const TOOL_LABELS: Record<string, string> = {
  search_poi: '正在查找景点信息',
  get_weather: '正在查询天气',
  plan_trip: '正在生成行程方案',
  get_plan: '正在读取行程方案',
  update_plan_status: '正在更新行程状态',
  memory_edit: '正在整理记忆',
};

const SUGGESTIONS = [
  '帮我安排一次 3 天的成都之旅',
  '推荐一个适合带爸妈去的地方',
  '查一下杭州明天的天气',
  '我想去云南玩 5 天，预算 3000 元',
];

const IDLE_AFTER_MS = 30000;
const VIDEO_SWITCH_MS = 6000;
const WORK_VIDEOS = ['work-map', 'work-hand-plan', 'work-typing'];
const IDLE_VIDEOS = ['idle-nap', 'idle-milktea', 'idle-spin'];

/** 小忆动态形象：生成方案时播工作动作；30 秒没动静播休闲动作；平时隐藏。 */
function XiaoyiLive({ busy, lastActivity }: { busy: boolean; lastActivity: number }) {
  const [mode, setMode] = useState<'work' | 'idle' | null>(null);
  const [videoIndex, setVideoIndex] = useState(0);

  useEffect(() => {
    if (busy) {
      setMode('work');
      return;
    }
    const check = () => setMode(Date.now() - lastActivity > IDLE_AFTER_MS ? 'idle' : null);
    check();
    const timer = window.setInterval(check, 3000);
    return () => window.clearInterval(timer);
  }, [busy, lastActivity]);

  // loop 视频不会触发 onEnded，用定时器轮换动作
  useEffect(() => {
    if (!mode) return;
    const timer = window.setInterval(() => setVideoIndex((index) => index + 1), VIDEO_SWITCH_MS);
    return () => window.clearInterval(timer);
  }, [mode]);

  const list = mode === 'work' ? WORK_VIDEOS : mode === 'idle' ? IDLE_VIDEOS : null;
  if (!list) return null;
  const name = list[videoIndex % list.length];

  return (
    <div className="xiaoyi-live">
      <video
        key={mode + '-' + name}
        src={'/xiaoyi/' + name + '.mp4'}
        autoPlay
        loop
        muted
        playsInline
        style={{ width: '100%', height: '168px', objectFit: 'cover' }}
      />
      <div className="xiaoyi-live-label">{mode === 'work' ? '小忆正在排行程…' : '小忆在发呆…'}</div>
    </div>
  );
}

export default function ChatPage() {
  const { message } = App.useApp();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [plans, setPlans] = useState<Itinerary[]>([]);
  const [tool, setTool] = useState<ToolState | null>(null);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [lastActivity, setLastActivity] = useState(() => Date.now());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([api.history('default', 60), api.plans()])
      .then(([history, planData]) => {
        if (!alive) return;
        setMessages(history.turns.map((turn) => ({ role: turn.role, text: turn.text, ts: turn.ts })));
        setPlans(planData.plans);
      })
      .catch(() => {
        if (alive) setMessages([]);
      })
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [
      ...messages.map((msg, index) => ({
        kind: 'msg' as const,
        key: 'msg-' + index + '-' + (msg.ts || 'live'),
        msg,
      })),
      ...plans.map((plan) => ({
        kind: 'plan' as const,
        key: 'plan-' + (plan.id || plan.ts),
        plan,
      })),
    ];
    items.sort((a, b) => {
      const at = a.kind === 'msg' ? a.msg.ts || '' : a.plan.ts || '';
      const bt = b.kind === 'msg' ? b.msg.ts || '' : b.plan.ts || '';
      // 没有 ts 的（正在流式输出）始终排最后
      if (!at && bt) return 1;
      if (at && !bt) return -1;
      if (at === bt) return 0;
      return at < bt ? -1 : 1;
    });
    return items;
  }, [messages, plans]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [timeline, tool]);

  const updatePlan = (plan: Itinerary) => {
    setPlans((prev) => {
      const index = prev.findIndex((item) => (plan.id ? item.id === plan.id : item.ts === plan.ts));
      if (index < 0) return [...prev, plan];
      const next = [...prev];
      next[index] = plan;
      return next;
    });
  };

  const removePlan = (plan: Itinerary) => {
    setPlans((prev) => prev.filter((item) => !(plan.id ? item.id === plan.id : item.ts === plan.ts)));
  };

  const handleStatus = async (plan: Itinerary, status: PlanStatus) => {
    if (!plan.id) return;
    try {
      const result = await api.setPlanStatus(plan.id, status);
      updatePlan(result.itinerary);
      const labels: Record<PlanStatus, string> = {
        draft: '草稿',
        confirmed: '已确认行程，城市已点亮到地图',
        in_progress: '已标记为进行中，祝玩得开心',
        completed: '行程已完成，已计入你的旅行足迹',
      };
      message.success(labels[status]);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '更新失败');
    }
  };

  const handleDelete = async (plan: Itinerary) => {
    if (!plan.id) return;
    try {
      await api.removePlan(plan.id);
      removePlan(plan);
      message.success('草稿已删除');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '删除失败');
    }
  };

  const handleRevise = (plan: Itinerary) => {
    setInput('修改这份行程（' + (plan.title || plan.destination || '旅行方案') + '）：');
  };

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);
    setLastActivity(Date.now());
    setMessages((prev) => [
      ...prev,
      { role: 'user', text, ts: new Date().toISOString() },
      { role: 'assistant', text: '', streaming: true },
    ]);

    const appendAssistant = (chunk: string) => {
      setMessages((prev) =>
        prev.map((item, index) =>
          index === prev.length - 1 ? { ...item, text: item.text + chunk } : item,
        ),
      );
    };
    const patchAssistant = (patch: Partial<Msg>) => {
      setMessages((prev) =>
        prev.map((item, index) => (index === prev.length - 1 ? { ...item, ...patch } : item)),
      );
    };

    try {
      await chatStream(text, 'default', {
        onDelta: (chunk) => {
          setTool(null);
          appendAssistant(chunk);
        },
        onToolStart: (name) => {
          setTool({ label: TOOL_LABELS[name] || '正在调用工具', status: 'running' });
        },
        onToolResult: (name, ok) => {
          setTool({ label: TOOL_LABELS[name] || name, status: ok ? 'ok' : 'fail' });
        },
        onItinerary: (value) => {
          updatePlan(value);
        },
        onDone: () => {
          setTool(null);
          patchAssistant({ streaming: false });
          setLastActivity(Date.now());
        },
        onError: (errorText) => {
          setTool(null);
          setMessages((prev) =>
            prev.map((item, index) => {
              if (index !== prev.length - 1) return item;
              const base = item.text ? item.text + '\n\n' : '';
              return { ...item, text: base + errorText, streaming: false, error: true };
            }),
          );
          message.error(errorText);
        },
      });
    } finally {
      setSending(false);
      setLastActivity(Date.now());
    }
  };

  const onPressEnter = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.shiftKey) return;
    event.preventDefault();
    void send();
  };

  const renderAssistantText = (msg: Msg) => {
    if (!msg.text) return msg.streaming ? null : '（无回复）';
    if (msg.streaming) return msg.text;
    return <ReactMarkdown>{msg.text}</ReactMarkdown>;
  };

  return (
    <div className="chat-page">
      <div className="chat-messages" ref={scrollRef}>
        {!loaded ? (
          <div className="centered-spin">
            <Spin />
          </div>
        ) : null}

        {loaded && messages.length === 0 && plans.length === 0 && !sending ? (
          <div style={{ textAlign: 'center', padding: '48px 16px' }}>
            <img src="/xiaoyi/xiaoyi-hero.png" alt="小忆" style={{ width: 120, height: 120, objectFit: 'contain' }} />
            <p style={{ fontSize: 18, fontWeight: 600, margin: '12px 0 4px' }}>你好，我是小忆</p>
            <p className="muted" style={{ margin: '0 0 20px' }}>
              告诉我你想去哪里，我来帮你排路线、查天气、算预算
            </p>
            <div className="chat-suggestions">
              {SUGGESTIONS.map((suggestion) => (
                <Tag key={suggestion} onClick={() => setInput(suggestion)}>
                  {suggestion}
                </Tag>
              ))}
            </div>
          </div>
        ) : null}

        {timeline.map((item) =>
          item.kind === 'msg' ? (
            item.msg.role === 'user' ? (
              <div className="msg-row user" key={item.key}>
                <div className="msg-bubble">{item.msg.text}</div>
              </div>
            ) : (
              <div className="msg-row assistant" key={item.key}>
                <div className="xiaoyi-avatar">
                  <img src="/xiaoyi/xiaoyi-avatar.png" alt="小忆" />
                </div>
                <div
                  className={
                    'msg-bubble' +
                    (item.msg.streaming ? ' streaming-cursor' : '') +
                    (item.msg.error ? ' msg-error' : '')
                  }
                >
                  {renderAssistantText(item.msg)}
                </div>
              </div>
            )
          ) : (
            <PlanCard
              itinerary={item.plan}
              key={item.key}
              onStatus={handleStatus}
              onRevise={handleRevise}
              onDelete={handleDelete}
            />
          ),
        )}

        {tool ? (
          <div className="chat-tools">
            <Tag
              color={tool.status === 'running' ? 'processing' : tool.status === 'ok' ? 'success' : 'error'}
            >
              {tool.status === 'running' ? <Spin size="small" style={{ marginRight: 6 }} /> : null}
              {tool.label}
              {tool.status === 'ok' ? ' ✓' : ''}
              {tool.status === 'fail' ? ' ✗' : ''}
            </Tag>
          </div>
        ) : null}
      </div>

      <XiaoyiLive busy={sending} lastActivity={lastActivity} />

      <div className="chat-input">
        <Input.TextArea
          value={input}
          onChange={(event) => {
            setInput(event.target.value);
            setLastActivity(Date.now());
          }}
          onPressEnter={onPressEnter}
          placeholder="说点什么…（Enter 发送，Shift+Enter 换行）"
          autoSize={{ minRows: 1, maxRows: 4 }}
          disabled={sending}
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={() => void send()}
          disabled={sending || !input.trim()}
        >
          {sending ? '小忆思考中…' : '发送'}
        </Button>
      </div>
    </div>
  );
}
