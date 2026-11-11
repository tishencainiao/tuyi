// v3.7.0 旅行相册：上传（前端压缩为 JPEG）、按行程分类、备注、删除
import { useEffect, useMemo, useState } from 'react';
import { App, Button, Empty, Input, Modal, Popconfirm, Select, Spin, Tag, Upload } from 'antd';
import { DeleteOutlined, EditOutlined, PictureOutlined, UploadOutlined } from '@ant-design/icons';
import { api, ApiError, AlbumPhoto, Plan } from '../api';
import { fileToDataUrl } from '../imageUtil';

export default function AlbumPage() {
  const { message } = App.useApp();
  const [photos, setPhotos] = useState<AlbumPhoto[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [filter, setFilter] = useState<string>('all'); // all | none | planId
  const [editing, setEditing] = useState<AlbumPhoto | null>(null);
  const [editCaption, setEditCaption] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [albumData, planData] = await Promise.all([api.album(), api.plans()]);
      setPhotos(albumData.photos);
      setPlans(planData.plans);
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : '相册加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (filter === 'all') return photos;
    if (filter === 'none') return photos.filter((p) => !p.tripId);
    return photos.filter((p) => p.tripId === filter);
  }, [photos, filter]);

  const planTitle = (tripId: string | null) => {
    if (!tripId) return null;
    return plans.find((p) => p.id === tripId)?.title || '（行程已删除）';
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const image = await fileToDataUrl(file);
      await api.addPhoto(image);
      message.success('照片已上传（记得给它归个类）');
      await load();
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : '上传失败，请重试');
    } finally {
      setUploading(false);
    }
  };

  const handleAssign = async (photo: AlbumPhoto, tripId: string | null) => {
    try {
      await api.updatePhoto(photo.id, { tripId });
      setPhotos((prev) => prev.map((p) => (p.id === photo.id ? { ...p, tripId } : p)));
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : '分类失败');
    }
  };

  const handleDelete = async (photo: AlbumPhoto) => {
    try {
      await api.removePhoto(photo.id);
      setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
      message.success('照片已删除');
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : '删除失败');
    }
  };

  const openEdit = (photo: AlbumPhoto) => {
    setEditing(photo);
    setEditCaption(photo.caption);
  };

  const handleEditSave = async () => {
    if (!editing) return;
    try {
      await api.updatePhoto(editing.id, { caption: editCaption.trim() });
      setPhotos((prev) => prev.map((p) => (p.id === editing.id ? { ...p, caption: editCaption.trim() } : p)));
      message.success('备注已保存');
      setEditing(null);
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : '保存失败');
    }
  };

  const filterOptions = [
    { value: 'all', label: '全部' },
    { value: 'none', label: '未分类' },
    ...plans.map((p) => ({ value: p.id, label: p.title })),
  ];

  return (
    <div className="page">
      <div className="page-head">
        <h2>旅行相册</h2>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Select
            value={filter}
            onChange={setFilter}
            options={filterOptions}
            style={{ minWidth: 220 }}
            placeholder="按行程筛选"
          />
          <Upload
            accept="image/*"
            showUploadList={false}
            beforeUpload={(file) => {
              handleUpload(file);
              return false;
            }}
          >
            <Button type="primary" icon={<UploadOutlined />} loading={uploading}>
              上传照片
            </Button>
          </Upload>
        </div>
      </div>
      {loading ? (
        <div className="centered-spin">
          <Spin size="large" />
        </div>
      ) : filtered.length === 0 ? (
        <Empty
          description={photos.length === 0 ? '还没有照片，把旅行中的美好时刻收进来吧' : '这个分类下还没有照片'}
          image={<PictureOutlined style={{ fontSize: 64, color: '#bae6fd' }} />}
        />
      ) : (
        <div className="album-grid">
          {filtered.map((photo) => (
            <div className="album-card" key={photo.id}>
              <div className="album-thumb">
                <img src={photo.url} alt={photo.caption || '旅行照片'} loading="lazy" />
              </div>
              <div className="album-meta">
                <Select
                  size="small"
                  value={photo.tripId || 'none'}
                  onChange={(v) => handleAssign(photo, v === 'none' ? null : v)}
                  options={[{ value: 'none', label: '未分类' }, ...plans.map((p) => ({ value: p.id, label: p.title }))]}
                  style={{ width: '100%' }}
                  dropdownMatchSelectWidth={false}
                />
                <div className="album-caption">
                  {photo.caption ? (
                    <span title={photo.caption}>{photo.caption}</span>
                  ) : (
                    <span className="album-caption-empty">加个备注…</span>
                  )}
                  <span className="album-actions">
                    <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEdit(photo)} />
                    <Popconfirm title="删除这张照片？" okText="删除" cancelText="取消" onConfirm={() => handleDelete(photo)}>
                      <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </span>
                </div>
                {planTitle(photo.tripId) && <Tag color="blue">{planTitle(photo.tripId)}</Tag>}
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal
        title="照片备注"
        open={editing !== null}
        onOk={handleEditSave}
        onCancel={() => setEditing(null)}
        okText="保存"
        cancelText="取消"
      >
        <Input.TextArea
          value={editCaption}
          onChange={(e) => setEditCaption(e.target.value)}
          maxLength={60}
          rows={2}
          placeholder="写点什么（比如：和外婆在锦里）"
        />
      </Modal>
    </div>
  );
}
