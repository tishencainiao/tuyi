import { useState } from 'react';
import { Button, Card, Collapse, Popconfirm, Space, Tag, Tooltip } from 'antd';
import { CheckCircleOutlined, ClockCircleOutlined, DeleteOutlined, EditOutlined, PlayCircleOutlined } from '@ant-design/icons';
import type { Itinerary, PlanStatus } from '../api';

const STATUS_TEXT: Record<PlanStatus, { text: string; color: string }> = {
  draft: { text: '草稿 · 待确认', color: 'gold' },
  confirmed: { text: '已确认', color: 'green' },
  in_progress: { text: '进行中', color: 'blue' },
  completed: { text: '已完成', color: 'cyan' },
};

function formatBudget(value: number) {
  return value > 0 ? '预算 ¥' + String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '预算未定';
}

interface Props {
  itinerary: Itinerary;
  /** 传了 onRevise 表示当前方案支持「在此基础上修改」（聊天页复用输入框） */
  onRevise?: (plan: Itinerary) => void;
  /** 传了 onStatus 表示渲染状态操作按钮 */
  onStatus?: (plan: Itinerary, status: PlanStatus) => void;
  onDelete?: (plan: Itinerary) => void;
  /** 草稿提示条是否显示（聊天页默认显示） */
  showDraftHint?: boolean;
}

function DayBlock({ day }: { day: Itinerary['days'][number] }) {
  return (
    <div className="plan-day">
      <div className="plan-day-title">
        {day.date || ''}
        {day.title ? ' · ' + day.title : ''}
      </div>
      <ul className="plan-day-items">
        {(day.items || []).map((item, itemIndex) => (
          <li key={itemIndex}>
            <span className="plan-item-time">{item.time || '--:--'}</span>
            <span className="plan-item-place">{item.place || '—'}</span>
            <span className="plan-item-activity">{item.activity || ''}</span>
            {item.transport ? <span className="muted">（{item.transport}）</span> : null}
            {item.cost_cny > 0 ? <span className="muted"> ¥{item.cost_cny}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function PlanCard({ itinerary, onRevise, onStatus, onDelete, showDraftHint = true }: Props) {
  const [showOld, setShowOld] = useState(false);
  const status = (itinerary.status || 'draft') as PlanStatus;
  const meta = STATUS_TEXT[status];
  const hasOld = Boolean(itinerary.previousDays && itinerary.previousDays.length > 0);

  const actions = (() => {
    if (!onStatus && !onRevise && !onDelete) return null;
    return (
      <Space wrap size={4}>
        {onRevise ? (
          <Button size="small" icon={<EditOutlined />} onClick={() => onRevise(itinerary)}>
            在这基础上修改
          </Button>
        ) : null}
        {onStatus && status === 'draft' ? (
          <Button size="small" type="primary" icon={<CheckCircleOutlined />} onClick={() => onStatus(itinerary, 'confirmed')}>
            确认行程
          </Button>
        ) : null}
        {onStatus && status === 'confirmed' ? (
          <Button size="small" icon={<PlayCircleOutlined />} onClick={() => onStatus(itinerary, 'in_progress')}>
            出发了
          </Button>
        ) : null}
        {onStatus && status === 'in_progress' ? (
          <Button size="small" type="primary" icon={<CheckCircleOutlined />} onClick={() => onStatus(itinerary, 'completed')}>
            旅行结束
          </Button>
        ) : null}
        {onDelete && status === 'draft' ? (
          <Popconfirm title="删除这份草稿？" okText="删除" cancelText="取消" onConfirm={() => onDelete(itinerary)}>
            <Button size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        ) : null}
      </Space>
    );
  })();

  return (
    <Card
      className={'plan-card plan-' + status}
      size="small"
      title={
        <span>
          {itinerary.title || '旅行方案'}
          <Tag color={meta.color} style={{ marginLeft: 8 }}>
            {meta.text}
          </Tag>
          {itinerary.revisions ? (
            <Tooltip title="在这份方案上修改的次数">
              <Tag>第 {itinerary.revisions + 1} 版</Tag>
            </Tooltip>
          ) : null}
        </span>
      }
      extra={<span className="muted">{itinerary.ts ? itinerary.ts.slice(0, 10) : ''}</span>}
    >
      <p style={{ margin: '0 0 8px' }}>
        <Tag color="blue">{itinerary.destination}</Tag>
        <Tag color="orange">{formatBudget(itinerary.budget_cny)}</Tag>
        <Tag icon={<ClockCircleOutlined />}>{itinerary.days.length} 天</Tag>
      </p>

      {showDraftHint && status === 'draft' ? (
        <div className="plan-draft-hint">
          这是草稿：确认后才会计入去过的城市、点亮地图；也可以让我「在这基础上修改」。
        </div>
      ) : null}

      {(itinerary.days || []).map((day, index) => (
        <DayBlock day={day} key={index} />
      ))}

      {hasOld ? (
        <Collapse
          ghost
          size="small"
          activeKey={showOld ? ['old'] : []}
          onChange={(keys) => setShowOld(keys.length > 0)}
          items={[
            {
              key: 'old',
              label: '查看已过去/被替换的 ' + itinerary.previousDays!.length + ' 天（修改前的安排）',
              children: (itinerary.previousDays || []).map((day, index) => <DayBlock day={day} key={index} />),
            },
          ]}
        />
      ) : null}

      {actions ? <div className="plan-card-actions">{actions}</div> : null}
    </Card>
  );
}
