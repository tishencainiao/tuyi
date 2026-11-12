import { useState } from 'react';
import { DatePicker, Form, Input, InputNumber, Modal } from 'antd';
import type { Dayjs } from 'dayjs';

/**
 * v3.9.0 新手「快速开始」意向表：
 * 字段全部可跳过，提交后把已填字段拼成一条普通消息交给 send()，
 * 走正常聊天流程（小忆排行程）。
 */
interface Props {
  open: boolean;
  onCancel: () => void;
  onSubmit: (text: string) => void;
}

interface FormValues {
  destination?: string;
  departDate?: Dayjs;
  days?: number;
  budget?: number;
  companions?: string;
  interests?: string;
}

export default function QuickStartModal({ open, onCancel, onSubmit }: Props) {
  const [form] = Form.useForm<FormValues>();
  const [submitting, setSubmitting] = useState(false);

  const handleOk = () => {
    form.validateFields().then((values) => {
      const parts: string[] = [];
      if (values.destination && values.destination.trim()) {
        parts.push('目的地' + values.destination.trim());
      }
      if (values.departDate) {
        parts.push(values.departDate.format('YYYY-MM-DD') + ' 出发');
      }
      if (values.days != null) parts.push('玩 ' + values.days + ' 天');
      if (values.budget != null) parts.push('预算 ' + values.budget + ' 元');
      if (values.companions && values.companions.trim()) {
        parts.push(values.companions.trim() + ' 同行');
      }
      if (values.interests && values.interests.trim()) {
        parts.push('喜欢' + values.interests.trim());
      }
      const text = parts.length > 0 ? '帮我规划一次旅行：' + parts.join('，') : '帮我规划一次旅行';
      setSubmitting(true);
      onSubmit(text);
      form.resetFields();
      setSubmitting(false);
    });
  };

  return (
    <Modal
      title="快速开始 · 旅行意向表"
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      okText="生成行程"
      cancelText="取消"
      confirmLoading={submitting}
      destroyOnClose
    >
      <p className="muted" style={{ margin: '0 0 16px' }}>
        填多少算多少，剩下的交给小忆去查去排；全跳过就直接让它自由发挥。
      </p>
      <Form form={form} layout="vertical">
        <Form.Item name="destination" label="目的地">
          <Input placeholder="如：柳州" maxLength={20} />
        </Form.Item>
        <Form.Item name="departDate" label="出发日期">
          <DatePicker style={{ width: '100%' }} placeholder="选日期（可跳过）" />
        </Form.Item>
        <Form.Item name="days" label="玩几天">
          <InputNumber min={1} max={60} style={{ width: '100%' }} placeholder="如：3" />
        </Form.Item>
        <Form.Item name="budget" label="预算（元）">
          <InputNumber min={0} max={1000000} style={{ width: '100%' }} placeholder="如：2000" />
        </Form.Item>
        <Form.Item name="companions" label="同行人">
          <Input placeholder="如：2 人，带爸妈" maxLength={30} />
        </Form.Item>
        <Form.Item name="interests" label="兴趣偏好">
          <Input placeholder="如：美食、拍照" maxLength={50} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
