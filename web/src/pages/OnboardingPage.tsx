// v3.2.0 注册引导页：注册后填写资料（可跳过），让排行程更贴合你
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Typography, Button, Space, message, Alert } from 'antd';
import { api } from '../api';
import ProfileForm from '../components/ProfileForm';
import { useApp } from '../store';

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { fetchUser } = useApp();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (values: Parameters<typeof api.onboard>[0]) => {
    setSubmitting(true);
    try {
      await api.onboard(values);
      await fetchUser();
      message.success('资料已保存，小忆排行程时会参考');
      navigate('/');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存失败');
      setSubmitting(false);
    }
  };

  const handleSkip = async () => {
    try {
      await api.onboard({});
      await fetchUser();
    } catch {
      /* 跳过失败不阻塞 */
    }
    navigate('/');
  };

  return (
    <div className="page" style={{ paddingTop: 24, paddingBottom: 48 }}>
      <Card className="auth-card" style={{ width: '100%', maxWidth: 680, margin: '0 auto' }} styles={{ body: { padding: 28 } }}>
        <Typography.Title level={4} style={{ marginTop: 0 }}>
          让行程更懂你（选填，可跳过）
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 20 }}>
          这些资料小忆排行程时会参考：比如有老人小孩同行会放慢节奏、选平缓景点。以后随时可以在「个人中心」修改。
        </Typography.Paragraph>
        <Alert
          type="info"
          showIcon
          message="填多少算多少，也可以直接跳过"
          style={{ marginBottom: 20 }}
        />
        <ProfileForm
          submitting={submitting}
          submitText="保存并开始"
          onSubmit={handleSubmit}
        />
        <Space style={{ marginTop: 12 }} wrap>
          <Button onClick={handleSkip}>跳过，以后再说</Button>
          <Typography.Text type="secondary">跳过也能正常使用</Typography.Text>
        </Space>
      </Card>
    </div>
  );
}
