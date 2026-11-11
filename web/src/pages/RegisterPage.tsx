import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { App, Button, Card, Form, Input } from 'antd';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { api, ApiError } from '../api';
import { useApp } from '../store';

export default function RegisterPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const setUser = useApp((state) => state.setUser);
  const [loading, setLoading] = useState(false);

  const onFinish = async (values: { username: string; password: string; confirm: string }) => {
    if (values.password !== values.confirm) {
      message.error('两次输入的密码不一致');
      return;
    }
    setLoading(true);
    try {
      const data = await api.register(values.username.trim(), values.password);
      setUser(data.user);
      message.success('注册成功，欢迎加入途忆');
      navigate('/', { replace: true });
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : '注册失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrap">
      <Card className="auth-card" title="注册途忆账号">
        <div className="auth-brand">
          <img src="/favicon.svg" alt="途忆" />
        </div>
        <Form layout="vertical" onFinish={onFinish} autoComplete="off">
          <Form.Item
            name="username"
            label="用户名"
            rules={[
              { required: true, message: '请输入用户名' },
              { min: 2, max: 20, message: '用户名需 2~20 个字符' },
            ]}
          >
            <Input prefix={<UserOutlined />} placeholder="2~20 个字符" maxLength={20} />
          </Form.Item>
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
