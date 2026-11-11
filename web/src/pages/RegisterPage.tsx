// v3.2.0 注册页：用户名 / 邮箱 / 手机号三种方式；邮箱与手机走模拟验证码
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { App, Alert, Button, Card, Form, Input, Tabs, Typography } from 'antd';
import { LockOutlined, MailOutlined, MobileOutlined, SafetyOutlined, UserOutlined } from '@ant-design/icons';
import { api, ApiError } from '../api';
import { useApp } from '../store';

type RegisterValues = {
  account: string;
  password: string;
  confirm: string;
  code?: string;
};

export default function RegisterPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const setUser = useApp((state) => state.setUser);
  const [form] = Form.useForm<RegisterValues>();
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [mockCode, setMockCode] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'username' | 'email' | 'phone'>('username');
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
    };
  }, []);

  const startCountdown = () => {
    setCountdown(60);
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1 && timerRef.current !== null) window.clearInterval(timerRef.current);
        return prev <= 1 ? 0 : prev - 1;
      });
    }, 1000);
  };

  const handleSendCode = async () => {
    const account = (form.getFieldValue('account') || '').trim();
    if (!account) {
      message.warning('请先输入邮箱或手机号');
      return;
    }
    setSending(true);
    try {
      const data = await api.verifyCode(account);
      setMockCode(data.mockCode);
      startCountdown();
      message.success('验证码已生成');
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : '获取验证码失败');
    } finally {
      setSending(false);
    }
  };

  const onFinish = async (values: RegisterValues) => {
    if (values.password !== values.confirm) {
      message.error('两次输入的密码不一致');
      return;
    }
    setLoading(true);
    try {
      const data = await api.register(values.account.trim(), values.password, values.code?.trim());
      setUser(data.user);
      message.success('注册成功，欢迎加入途忆');
      navigate('/onboarding', { replace: true });
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : '注册失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const onTabChange = (key: string) => {
    setActiveTab(key as typeof activeTab);
    setMockCode(null);
    setCountdown(0);
    form.setFieldValue('account', '');
    form.setFieldValue('code', '');
  };

  const accountRules = {
    username: [
      { required: true, message: '请输入用户名' },
      { min: 2, max: 20, message: '用户名需 2~20 个字符' },
    ],
    email: [
      { required: true, message: '请输入邮箱' },
      { type: 'email' as const, message: '邮箱格式不正确' },
    ],
    phone: [
      { required: true, message: '请输入手机号' },
      { pattern: /^1[3-9]\d{9}$/, message: '手机号格式不正确' },
    ],
  }[activeTab];

  const tabItems = [
    {
      key: 'username',
      label: '用户名注册',
      children: (
        <Form.Item name="account" label="用户名" rules={accountRules}>
          <Input prefix={<UserOutlined />} placeholder="2~20 个字符" maxLength={20} autoComplete="off" />
        </Form.Item>
      ),
    },
    {
      key: 'email',
      label: '邮箱注册',
      children: (
        <>
          <Form.Item name="account" label="邮箱" rules={accountRules}>
            <Input prefix={<MailOutlined />} placeholder="you@example.com" autoComplete="off" />
          </Form.Item>
          <Form.Item label="邮箱验证码" required>
            <div className="code-row">
              <Form.Item
                name="code"
                noStyle
                rules={[{ required: true, message: '请输入验证码' }]}
              >
                <Input prefix={<SafetyOutlined />} placeholder="6 位验证码" maxLength={6} />
              </Form.Item>
              <Button onClick={handleSendCode} loading={sending} disabled={countdown > 0}>
                {countdown > 0 ? `${countdown} 秒后重发` : '获取验证码'}
              </Button>
            </div>
          </Form.Item>
        </>
      ),
    },
    {
      key: 'phone',
      label: '手机号注册',
      children: (
        <>
          <Form.Item name="account" label="手机号" rules={accountRules}>
            <Input prefix={<MobileOutlined />} placeholder="11 位手机号" maxLength={11} autoComplete="off" />
          </Form.Item>
          <Form.Item label="短信验证码" required>
            <div className="code-row">
              <Form.Item
                name="code"
                noStyle
                rules={[{ required: true, message: '请输入验证码' }]}
              >
                <Input prefix={<SafetyOutlined />} placeholder="6 位验证码" maxLength={6} />
              </Form.Item>
              <Button onClick={handleSendCode} loading={sending} disabled={countdown > 0}>
                {countdown > 0 ? `${countdown} 秒后重发` : '获取验证码'}
              </Button>
            </div>
          </Form.Item>
        </>
      ),
    },
  ];

  return (
    <div className="auth-wrap">
      <Card className="auth-card" title="注册途忆账号">
        <div className="auth-brand">
          <img src="/favicon.svg" alt="途忆" />
        </div>
        <Form form={form} layout="vertical" onFinish={onFinish} autoComplete="off">
          <Tabs activeKey={activeTab} onChange={onTabChange} items={tabItems} size="small" />
          {mockCode && (
            <Alert
              type="success"
              showIcon
              message={
                <Typography.Text>
                  模拟验证码：<Typography.Text strong copyable>{mockCode}</Typography.Text>
                </Typography.Text>
              }
              description="演示环境直接显示，正式版由短信 / 邮件下发"
              style={{ marginBottom: 16 }}
            />
          )}
          <Form.Item
            name="password"
            label="密码"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 6, message: '密码至少 6 位' },
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="至少 6 位" />
          </Form.Item>
          <Form.Item
            name="confirm"
            label="确认密码"
            dependencies={['password']}
            rules={[
              { required: true, message: '请再次输入密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) return Promise.resolve();
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="再输入一次密码" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 8 }}>
            <Button type="primary" htmlType="submit" block loading={loading}>
              注册
            </Button>
          </Form.Item>
        </Form>
        <div style={{ textAlign: 'center' }} className="muted">
          已有账号？<Link to="/login">去登录</Link>
        </div>
      </Card>
    </div>
  );
}
