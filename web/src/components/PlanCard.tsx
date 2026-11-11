import { useState } from 'react';
import { Button, Card, Collapse, Input, Modal, Popconfirm, Radio, Space, Tag, Tooltip } from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  PlayCircleOutlined,
  RollbackOutlined,
} from '@ant-design/icons';
import type { Itinerary, PlanStatus } from '../api';

const STATUS_TEXT: Record<PlanStatus, { text: string; color: string }> = {
  draft: { text: '草稿 · 待确认', color: 'gold' },
  confirmed: { text: '已确认', color: 'green' },
  in_progress: { text: '进行中', color: 'blue' },
  completed: { text: '已完成', color: 'cyan' },
};

const STATUS_OPTIONS: { value: PlanStatus; label: string; hint: string }[] = [
  { value: 'draft', label: '草稿（撤销，不再计入统计）', hint: '还没定下来，或不想去了' },
  { value: 'confirmed', label: '已确认', hint: '方案定了，准备去' },
  { value: 'in_progress', label: '进行中', hint: '已经出发在玩了' },
  { value: 'completed', label: '已完成', hint: '旅行结束回来了' },
];

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
  /** 传了 onRename 表示支持给行程改名（v3.5.0） */
  onRename?: (plan: Itinerary, title: string) => void;
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

export default function PlanCard({
  itinerary,
  onRevise,
  onStatus,
  onDelete,
  onRename,
  showDraftHint = true,
}: Props) {
  const [showOld, setShowOld] = useState(false);
  // v3.5.0：状态回退（任意回退，Modal 里选目标状态）
  const [revertOpen, setRevertOpen] = useState(false);
  const [revertTo, setRevertTo] = useState<PlanStatus>('draft');
  // v3.5.0：行程改名
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameText, setRenameText] = useState('');

  const status = (itinerary.status || 'draft') as PlanStatus;
  const meta = STATUS_TEXT[status];
  const hasOld = Boolean(itinerary.previousDays && itinerary.previousDays.length > 0);

  const openRevert = () => {
    const candidates = STATUS_OPTIONS.filter((option) => option.value !== status);
    setRevertTo(candidates[0] ? candidates[0].value : 'draft');
    setRevertOpen(true);
  };

  const openRename = () => {
    setRenameText(itinerary.title || '');
    setRenameOpen(true);
  };

  const actions = (() => {
    if (!onStatus && !onRevise && !onDelete && !onRename) return null;
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
        {onStatus && status !== 'draft' ? (
          <Button size="small" icon={<RollbackOutlined />} onClick={openRevert}>
            回退状态
          </Button>
        ) : null}
        {onRename ? (
          <Button size="small" icon={<EditOutlined />} onClick={openRename}>
            改名
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

      <div className="plan-card-disclaimer">金额与时间仅为估算，仅作参考</div>

      {actions ? <div className="plan-card-actions">{actions}</div> : null}

      <Modal
        title="把这份行程改到什么状态？"
        open={revertOpen}
        onOk={() => {
          if (onStatus) onStatus(itinerary, revertTo);
          setRevertOpen(false);
        }}
        onCancel={() => setRevertOpen(false)}
        okText="确定改"
        cancelText="取消"
      >
        <Radio.Group value={revertTo} onChange={(event) => setRevertTo(event.target.value as PlanStatus)}>
          <Space direction="vertical">
            {STATUS_OPTIONS.filter((option) => option.value !== status).map((option) => (
              <Radio key={option.value} value={option.value}>
                {option.label}
                <div className="muted" style={{ fontSize: 12 }}>
                  {option.hint}
                </div>
              </Radio>
            ))}
          </Space>
        </Radio.Group>
      </Modal>

      <Modal
        title="给这份行程起个名字"
        open={renameOpen}
        onOk={() => {
          if (onRename && renameText.trim()) onRename(itinerary, renameText.trim());
          setRenameOpen(false);
        }}
        onCancel={() => setRenameOpen(false)}
        okText="保存"
        cancelText="取消"
        okButtonProps={{ disabled: renameText.trim().length < 1 || renameText.trim().length > 60 }}
      >
        <Input
          value={renameText}
          onChange={(event) => setRenameText(event.target.value)}
          maxLength={60}
          placeholder="例如：成都带爸妈三日游"
          autoFocus
        />
      </Modal>
    </Card>
  );
}
