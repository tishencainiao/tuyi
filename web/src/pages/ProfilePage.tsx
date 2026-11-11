import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  App,
  Avatar,
  Button,
  Card,
  Col,
  Collapse,
  Descriptions,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Popconfirm,
  Row,
  Select,
  Spin,
  Tag,
  Typography,
} from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  LogoutOutlined,
  PlusOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { api, ApiError, MemoryItem, Profile } from '../api';
import { useApp } from '../store';
import PlanCard from '../components/PlanCard';

function formatDate(value: string) {
  return value ? value.slice(0, 10) : '—';
}

export default function ProfilePage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const user = useApp((state) => state.user);
  const logout = useApp((state) => state.logout);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [newText, setNewText] = useState('');
  const [newTags, setNewTags] = useState<string[]>([]);

  const [editing, setEditing] = useState<MemoryItem | null>(null);
  const [editText, setEditText] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editOpen, setEditOpen] = useState(false);

  const load = () => {
    setLoading(true);
    api
      .profile()
      .then(setProfile)
      .catch((err) => {
        message.error(err instanceof ApiError ? err.message : '加载失败');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addMemory = async () => {
    const text = newText.trim();
    if (text.length < 2) {
      message.warning('记忆内容至少 2 个字');
      return;
    }
    setSaving(true);
    try {
      await api.createMemory(text, newTags);
      setNewText('');
      setNewTags([]);
      message.success('已添加记忆');
      load();
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : '添加失败');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (item: MemoryItem) => {
    setEditing(item);
    setEditText(item.text);
    setEditTags(item.tags || []);
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (editText.trim().length < 2) {
      message.warning('记忆内容至少 2 个字');
      return;
    }
    setSaving(true);
    try {
      await api.updateMemory(editing.id, { text: editText.trim(), tags: editTags });
      message.success('已保存修改');
      setEditOpen(false);
      setEditing(null);
      load();
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const removeMemory = async (item: MemoryItem) => {
    try {
      await api.removeMemory(item.id);
      message.success('已删除该记忆');
      load();
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : '删除失败');
    }
  };

  const onLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  if (loading) {
    return (
      <div className="page" style={{ textAlign: 'center', paddingTop: 64 }}>
        <Spin size="large" />
      </div>
    );
  }
  if (!profile) return null;

  const summary = profile.insights && profile.insights.summary;
  const insightTags = (profile.insights && profile.insights.tags) || [];

  return (
    <div className="page">
      <Row gutter={[16, 16]}>
        <Col xs={24} md={9}>
          <Card title="个人信息" size="small" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <Avatar size={48} style={{ background: '#0ea5e9' }} icon={<UserOutlined />} />
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{profile.username}</div>
                <div className="muted">ID：{profile.userId}</div>
              </div>
            </div>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="注册时间">{formatDate(profile.created)}</Descriptions.Item>
              <Descriptions.Item label="聊天轮数">{profile.turnsCount}</Descriptions.Item>
              <Descriptions.Item label="记忆条数">{profile.memories.length}</Descriptions.Item>
              <Descriptions.Item label="行程方案">{profile.itineraries.length}</Descriptions.Item>
            </Descriptions>
            <Button danger icon={<LogoutOutlined />} onClick={onLogout} style={{ marginTop: 12 }} block>
              退出登录
            </Button>
          </Card>

          <Card title="小忆对我的了解" size="small">
            {summary ? (
              <>
                <Typography.Paragraph style={{ marginBottom: 8 }}>{summary}</Typography.Paragraph>
                {insightTags.length ? (
                  <div>
                    {insightTags.map((tag) => (
                      <Tag key={tag} color="blue">
                        {tag}
                      </Tag>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="多和小忆聊几次，它会在这里总结对你的了解。"
              />
            )}
          </Card>
        </Col>

        <Col xs={24} md={15}>
          <Card title={'我的行程（最近 ' + profile.itineraries.length + ' 条）'} size="small">
            {profile.itineraries.length ? (
              <Collapse
                items={profile.itineraries.map((itinerary, index) => ({
                  key: String(index),
                  label: (
                    <span>
                      {itinerary.title || '旅行方案'}
                      <span className="muted" style={{ marginLeft: 8 }}>
                        {itinerary.destination} · {itinerary.days.length} 天 ·{' '}
                        {formatDate(itinerary.ts)}
                      </span>
                    </span>
                  ),
                  children: <PlanCard itinerary={itinerary} />,
                }))}
              />
            ) : (
              <Empty description="还没有生成过行程方案。">
                <Button type="primary" onClick={() => navigate('/')}>
                  去和小忆聊聊
                </Button>
              </Empty>
            )}
          </Card>
        </Col>
      </Row>

      <Card
        title="记忆管理"
        size="small"
        style={{ marginTop: 16 }}
        extra={<span className="muted">记忆会帮助小忆更懂你；你也可以随时修改或删除</span>}
      >
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <Input.TextArea
            value={newText}
            onChange={(event) => setNewText(event.target.value)}
            placeholder="记一条想告诉小忆的事，例如：我喜欢吃辣、出行喜欢坐高铁"
            autoSize={{ minRows: 1, maxRows: 3 }}
            maxLength={200}
            style={{ flex: 1, minWidth: 240 }}
          />
          <Select
            mode="tags"
            value={newTags}
            onChange={setNewTags}
            placeholder="标签（可选，输入后回车添加）"
            style={{ minWidth: 160 }}
            open={false}
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => void addMemory()}
            loading={saving}
          >
            添加
          </Button>
        </div>

        <List
          dataSource={profile.memories}
          locale={{ emptyText: '还没有记忆：聊几轮，小忆会把你的偏好记在这里。' }}
          renderItem={(item) => (
            <List.Item
              actions={[
                <Button
                  key="edit"
                  type="text"
                  icon={<EditOutlined />}
                  onClick={() => openEdit(item)}
                />,
                <Popconfirm
                  key="delete"
                  title="删除这条记忆？"
                  description="删除后小忆将不再记得这件事"
                  onConfirm={() => void removeMemory(item)}
                >
                  <Button type="text" danger icon={<DeleteOutlined />} />
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta
                title={
                  <span>
                    {item.text}
                    <span className="muted" style={{ marginLeft: 8, fontWeight: 400 }}>
                      {formatDate(item.ts)}
                    </span>
                  </span>
                }
                description={
                  (item.tags || []).length ? (
                    <div>
                      {(item.tags || []).map((tag) => (
                        <Tag key={tag} color="orange">
                          {tag}
                        </Tag>
                      ))}
                    </div>
                  ) : null
                }
              />
            </List.Item>
          )}
        />
      </Card>

      <Modal
        title="修改记忆"
        open={editOpen}
        onOk={() => void saveEdit()}
        onCancel={() => setEditOpen(false)}
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
      >
        <Form layout="vertical">
          <Form.Item label="内容">
            <Input.TextArea
              value={editText}
              onChange={(event) => setEditText(event.target.value)}
              maxLength={200}
              autoSize={{ minRows: 2, maxRows: 4 }}
            />
          </Form.Item>
          <Form.Item label="标签">
            <Select
              mode="tags"
              value={editTags}
              onChange={setEditTags}
              placeholder="标签（可选，输入后回车添加）"
              open={false}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
