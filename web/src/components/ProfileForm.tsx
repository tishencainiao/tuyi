// v3.2.0 个人资料表单：注册引导页与个人中心共用
import { useState } from 'react';
import { Form, Input, InputNumber, Select, Button, Space } from 'antd';
import { PlusOutlined, MinusCircleOutlined } from '@ant-design/icons';
import type { UserInfo } from '../api';

export interface ProfileFormProps {
  initial?: Partial<UserInfo>;
  submitting?: boolean;
  onSubmit: (values: UserInfo) => void;
  submitText?: string;
  showCancel?: boolean;
  onCancel?: () => void;
}

const TAGS_PLACEHOLDER = '输入后回车添加，例如：美食、拍照、博物馆';

export default function ProfileForm({
  initial,
  submitting = false,
  onSubmit,
  submitText = '保存',
  showCancel = false,
  onCancel,
}: ProfileFormProps) {
  const [form] = Form.useForm();
  const [tagInput, setTagInput] = useState('');
  const preferences: string[] = Form.useWatch('preferences', form) || [];

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={{
        nickname: initial?.nickname ?? '',
        age: initial?.age ?? null,
        gender: initial?.gender || undefined,
        companions: (initial?.companions && initial.companions.length > 0 ? initial.companions : [{ name: '', relation: '', age: null }]),
        preferences: initial?.preferences ?? [],
        travel_style: initial?.travel_style ?? '',
        health_notes: initial?.health_notes ?? '',
      }}
      onFinish={(values) => onSubmit(values as UserInfo)}
      requiredMark={false}
    >
      <Form.Item name="nickname" label="称呼" rules={[{ max: 20, message: '最多 20 个字' }]}>
        <Input placeholder="怎么称呼你（选填）" />
      </Form.Item>

      <Space size="large" wrap>
        <Form.Item name="age" label="年龄">
          <InputNumber min={1} max={120} placeholder="选填" style={{ width: 120 }} />
        </Form.Item>
        <Form.Item name="gender" label="性别">
          <Select
            allowClear
            placeholder="选填"
            style={{ width: 110 }}
            options={[
              { value: '男', label: '男' },
              { value: '女', label: '女' },
              { value: '保密', label: '保密' },
            ]}
          />
        </Form.Item>
      </Space>

      <Form.Item label="同行的家人朋友（影响行程节奏：有老人小孩会放慢安排）">
        <Form.List name="companions">
          {(fields, { add, remove }) => (
            <>
              {fields.map(({ key, name }) => (
                <Space key={key} align="baseline" style={{ display: 'flex', marginBottom: 8 }} wrap>
                  <Form.Item name={[name, 'relation']} rules={[{ max: 20, message: '最多 20 个字' }]}>
                    <Input placeholder="关系（如：妈妈）" style={{ width: 140 }} />
                  </Form.Item>
                  <Form.Item name={[name, 'name']} rules={[{ max: 20, message: '最多 20 个字' }]}>
                    <Input placeholder="称呼（如：王阿姨）" style={{ width: 140 }} />
                  </Form.Item>
                  <Form.Item name={[name, 'age']}>
                    <InputNumber min={1} max={120} placeholder="年龄" style={{ width: 90 }} />
                  </Form.Item>
                  <MinusCircleOutlined
                    aria-label="删除同行人"
                    onClick={() => remove(name)}
                    style={{ color: '#94a3b8' }}
                  />
                </Space>
              ))}
              <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add({ name: '', relation: '', age: null })}>
                添加一位同行人
              </Button>
            </>
          )}
        </Form.List>
      </Form.Item>

      <Form.Item label="旅行偏好标签">
        <Input
          id="tag-input"
          placeholder={TAGS_PLACEHOLDER}
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onPressEnter={(e) => {
            e.preventDefault();
            const value = tagInput.trim();
            if (!value) return;
            const current: string[] = form.getFieldValue('preferences') || [];
            if (!current.includes(value)) form.setFieldValue('preferences', [...current, value]);
            setTagInput('');
          }}
        />
        {preferences.length > 0 && (
          <Space size={[8, 8]} wrap style={{ marginTop: 8 }}>
            {preferences.map((tag, index) => (
              <span key={tag + index} className="tag-chip">
                {tag}
                <a
                  aria-label="删除标签"
                  onClick={() => {
                    const next = preferences.filter((_, i) => i !== index);
                    form.setFieldValue('preferences', next);
                  }}
                  style={{ marginLeft: 6, color: '#0284c7' }}
                >
                  ×
                </a>
              </span>
            ))}
          </Space>
        )}
      </Form.Item>
      {/* preferences 只存不渲染：标签值由上方输入框用 setFieldValue 维护 */}
      <Form.Item name="preferences" hidden />

      <Form.Item name="travel_style" label="喜欢的旅行风格">
        <Select
          allowClear
          placeholder="选填"
          options={[
            { value: '松弛', label: '松弛（少赶路、多休息）' },
            { value: '紧凑', label: '紧凑（多打卡）' },
            { value: '深度', label: '深度（少而精）' },
            { value: '美食优先', label: '美食优先' },
            { value: '拍照出片', label: '拍照出片' },
          ]}
        />
      </Form.Item>

      <Form.Item name="health_notes" label="健康备注（选填，排行程时会避开不合适的项目）" rules={[{ max: 200, message: '最多 200 个字' }]}>
        <Input.TextArea rows={2} placeholder="例如：膝盖不好少爬楼、恐高不坐索道" />
      </Form.Item>

      <Space>
        <Button type="primary" htmlType="submit" loading={submitting}>
          {submitText}
        </Button>
        {showCancel && <Button onClick={onCancel}>取消</Button>}
      </Space>
    </Form>
  );
}
