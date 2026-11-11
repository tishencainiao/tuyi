import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { App, Button, Input, Spin, Tag } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import { api, chatStream, Itinerary } from '../api';
import PlanCard from '../components/PlanCard';

interface Msg {
  role: 'user' | 'assistant';
  text: string;
  streaming?: boolean;
  error?: boolean;
}

interface ToolState {
  label: string;
  status: 'running' | 'ok' | 'fail';
}

const TOOL_LABELS: Record<string, string> = {
  search_poi: '正在查找景点信息',
  get_weather: '正在查询天气',
  plan_trip: '正在生成行程方案',
  memory_edit: '正在整理记忆',
};

const SUGGESTIONS = [
  '帮我安排一次 3 天的成都之旅',
  '推荐一个适合带爸妈去的地方',
  '查一下杭州明天的天气',
  '我想去云南玩 5 天，预算 3000 元',
];

export default function ChatPage() {
  const { message } = App.useApp();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [plans, setPlans] = useState<Itinerary[]>([]);
  const [tool, setTool] = useState<ToolState | null>(null);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState('');
  const [loaded, setLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    api
      .history('default', 60)
      .then((data) => {
        if (!alive) return;
        setMessages(data.turns.map((turn) => ({ role: turn.role, text: turn.text })));
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

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, plans, tool]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);
    const assistantIndex = messages.length + 1;
    setMessages((prev) => [
      ...prev,
      { role: 'user', text },
      { role: 'assistant', text: '', streaming: true },
    ]);

    const appendAssistant = (chunk: string) => {
      setMessages((prev) =>
        prev.map((item, index) =>
          index === assistantIndex ? { ...item, text: item.text + chunk } : item,
        ),
      );
    };
    const patchAssistant = (patch: Partial<Msg>) => {
      setMessages((prev) =>
        prev.map((item, index) => (index === assistantIndex ? { ...item, ...patch } : item)),
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
          setPlans((prev) => [...prev, value]);
        },
        onDone: () => {
          setTool(null);
          patchAssistant({ streaming: false });
        },
        onError: (errorText) => {
          setTool(null);
          setMessages((prev) =>
            prev.map((item, index) => {
              if (index !== assistantIndex) return item;
              const base = item.text ? item.text + '\n\n' : '';
              return { ...item, text: base + errorText, streaming: false, error: true };
            }),
          );
          message.error(errorText);
        },
      });
    } finally {
      setSending(false);
    }
  };

  const onPressEnter = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.shiftKey) return;
    event.preventDefault();
    void send();
  };

  return (
    <div className="chat-page">
      <div className="chat-messages" ref={scrollRef}>
        {!loaded ? (
          <div className="centered-spin">
            <Spin />
          </div>
        ) : null}

        {loaded && messages.length === 0 && !sending ? (
          <div style={{ textAlign: 'center', padding: '48px 16px' }}>
            <img src="/favicon.svg" alt="小忆" style={{ width: 72, height: 72 }} />
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

        {messages.map((item, index) =>
          item.role === 'user' ? (
            <div className="msg-row user" key={'u' + index}>
              <div className="msg-bubble">{item.text}</div>
            </div>
          ) : (
            <div className="msg-row assistant" key={'a' + index}>
              <div className="xiaoyi-avatar">
                <img src="/favicon.svg" alt="小忆" />
              </div>
              <div
                className={
                  'msg-bubble' +
                  (item.streaming ? ' streaming-cursor' : '') +
                  (item.error ? ' msg-error' : '')
                }
              >
                {item.text || (item.streaming ? '' : '（无回复）')}
              </div>
            </div>
          ),
        )}

        {plans.map((plan, index) => (
          <PlanCard itinerary={plan} key={plan.ts + '-' + index} />
        ))}

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

      <div className="chat-input">
        <Input.TextArea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onPressEnter={onPressEnter}
          placeholder="和小忆说点什么…（Enter 发送，Shift+Enter 换行）"
          autoSize={{ minRows: 2, maxRows: 5 }}
          maxLength={2000}
          disabled={sending}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={() => void send()}
            loading={sending}
            disabled={!input.trim()}
          >
            发送
          </Button>
        </div>
      </div>
    </div>
  );
}
