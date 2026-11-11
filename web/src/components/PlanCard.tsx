import { Card, Tag } from 'antd';
import { ClockCircleOutlined } from '@ant-design/icons';
import { Itinerary } from '../api';

const STATUS_TEXT: Record<string, { text: string; color: string }> = {
  draft: { text: '草稿 · 待确认', color: 'gold' },
  confirmed: { text: '已确认', color: 'green' },
  in_progress: { text: '进行中', color: 'blue' },
  completed: { text: '已完成', color: 'cyan' },
};

function formatBudget(value: number) {
  return value > 0 ? '预算 ¥' + String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '预算未定';
}

export default function PlanCard({ itinerary }: { itinerary: Itinerary }) {
  const status = itinerary.status && STATUS_TEXT[itinerary.status];
  return (
    <Card
      className={'plan-card ' + (itinerary.status === 'draft' ? 'plan-draft' : itinerary.status === 'completed' ? 'plan-completed' : '')}
      size="small"
      title={
        <span>
          {itinerary.title || '旅行方案'}
          {status ? (
            <Tag color={status.color} style={{ marginLeft: 8 }}>
              {status.text}
            </Tag>
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
      {(itinerary.days || []).map((day, index) => (
        <div className="plan-day" key={index}>
          <div className="plan-day-title">{day.title || '第 ' + (index + 1) + ' 天'}</div>
          <ul className="plan-day-items">
            {(day.items || []).map((item, itemIndex) => (
              <li key={itemIndex}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
    </Card>
  );
}
