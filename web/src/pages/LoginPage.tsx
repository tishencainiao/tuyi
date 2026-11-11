import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { App, Button, Card, Form, Input } from 'antd';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { api, ApiError } from '../api';
import { useApp } from '../store';

export default function LoginPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const setUser = useApp((state) => state.setUser);
  const [loading, setLoading] = useState(false);

  const onFinish = async (values: { account: string; password: string }) => {
    setLoading(true);
    try {
      const data = await api.login(values.account.trim(), values.password);
      setUser(data.user);
      message.success('欢迎回来，' + (data.user.username || '旅行家'));
      navigate('/', { replace: true });
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : '登录失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrap">
      <Card className="auth-card">
        <div className="auth-brand">
          <img src="/xiaoyi/xiaoyi-hero.png" alt="小忆" />
          <div className="name">途忆</div>
          <div className="slogan">小忆帮你把想去的地方，变成能走的路线</div>
        </div>
        <Form layout="vertical" onFinish={onFinish} autoComplete="off">
          <Form.Item
            name="account"
            label="账号"
            rules={[{ required: true, message: '请输入用户名 / 邮箱 / 手机号' }]}
          >
            <Input prefix={<UserOutlined />} placeholder="用户名 / 邮箱 / 手机号" maxLength={64} />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="至少 6 位" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 8 }}>
            <Button type="primary" htmlType="submit" block loading={loading}>
              登录
            </Button>
          </Form.Item>
        </Form>
        <div style={{ textAlign: 'center' }} className="muted">
          还没有账号？<Link to="/register">立即注册</Link>
        </div>
      </Card>
    </div>
  );
}
