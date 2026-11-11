import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Button, Card, Col, Empty, Row, Segmented, Spin, Statistic, Table, Tag } from 'antd';
import * as echarts from 'echarts';
import { api, ApiError, PersonalStats, Visit } from '../api';

function normName(name: string) {
  return String(name || '')
    .replace(/(省|市|自治区|特别行政区|自治州|地区|盟)$/g, '')
    .trim();
}

function fmt(value: number) {
  return String(value == null ? 0 : value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

let geoPromise: Promise<{ provinces: unknown; cities: unknown }> | null = null;
function loadGeo() {
  if (!geoPromise) {
    geoPromise = Promise.all([
      fetch('/vendor/geo/china-provinces.json').then((resp) => resp.json()),
      fetch('/vendor/geo/china-cities.json').then((resp) => resp.json()),
    ]).then(([provinces, cities]) => {
      echarts.registerMap('china-provinces', provinces);
      echarts.registerMap('china-cities', cities);
      return { provinces, cities };
    });
  }
  return geoPromise;
}

type Geo = { provinces: any; cities: any };

export default function TravelPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [stats, setStats] = useState<PersonalStats | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [mapLevel, setMapLevel] = useState<'province' | 'city'>('province');
  const [loading, setLoading] = useState(true);

  const cityChartRef = useRef<HTMLDivElement>(null);
  const tagChartRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([api.personalStats(), api.visits()])
      .then(([personal, visitData]) => {
        if (!alive) return;
        setStats(personal);
        setVisits(visitData.manual || []);
      })
      .catch((err) => {
        if (!alive) return;
        message.error(err instanceof ApiError ? err.message : '数据加载失败');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [message]);

  useEffect(() => {
    if (!stats || !cityChartRef.current || !tagChartRef.current) return;
    const cityChart = echarts.init(cityChartRef.current);
    const tagChart = echarts.init(tagChartRef.current);
    cityChart.setOption({
      grid: { left: 8, right: 24, top: 8, bottom: 8, containLabel: true },
      xAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: '#eef1f6' } },
        minInterval: 1,
      },
      yAxis: {
        type: 'category',
        data: stats.cities.map((item) => item.city).reverse(),
        axisTick: { show: false },
      },
      tooltip: { trigger: 'axis' },
      series: [
        {
          type: 'bar',
          data: stats.cities.map((item) => item.count).reverse(),
          itemStyle: { color: '#0ea5e9', borderRadius: [0, 6, 6, 0] },
          barMaxWidth: 18,
        },
      ],
    });
    tagChart.setOption({
      grid: { left: 8, right: 24, top: 8, bottom: 8, containLabel: true },
      xAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: '#eef1f6' } },
        minInterval: 1,
      },
      yAxis: {
        type: 'category',
        data: (stats.tags || []).map((item) => item.label).reverse(),
        axisTick: { show: false },
      },
      tooltip: { trigger: 'axis' },
      series: [
        {
          type: 'bar',
          data: (stats.tags || []).map((item) => item.value).reverse(),
          itemStyle: { color: '#fb923c', borderRadius: [0, 6, 6, 0] },
          barMaxWidth: 18,
        },
      ],
    });
    const onResize = () => {
      cityChart.resize();
      tagChart.resize();
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      cityChart.dispose();
      tagChart.dispose();
    };
  }, [stats]);

  const toggleVisit = async (name: string, level: string) => {
    if (!name) return;
    const exists = visits.some((item) => item.name === name && item.level === level);
    try {
      if (exists) {
        await api.removeVisit(name, level);
      } else {
        await api.addVisit(name, level);
      }
      const data = await api.visits();
      setVisits(data.manual || []);
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : '操作失败，请重试');
    }
  };

  useEffect(() => {
    if (!stats || !mapRef.current) return;
    let chart: echarts.ECharts | null = null;
    let disposed = false;
    loadGeo()
      .then((geo: Geo) => {
        if (disposed || !mapRef.current) return;
        chart = echarts.init(mapRef.current);
        chart.on('click', (params) => {
          void toggleVisit(String(params.name), mapLevel);
        });

        const provinceMode = mapLevel === 'province';
        const features = (provinceMode ? geo.provinces : geo.cities).features || [];
        const values = new Map<string, number>();

        if (provinceMode) {
          const cityIndex = new Map<string, { properties: { name: string; province?: string } }>();
          (geo.cities.features || []).forEach((feature: any) => {
            const name = normName(feature.properties && feature.properties.name);
            if (name && !cityIndex.has(name)) cityIndex.set(name, feature);
          });
          (stats.cities || []).forEach((item) => {
            const feature = cityIndex.get(normName(item.city));
            let provinceName = feature ? feature.properties.province : null;
            if (!provinceName) {
              const province = (geo.provinces.features || []).find(
                (node: any) => normName(node.properties.name) === normName(item.city),
              );
              provinceName = province ? province.properties.name : null;
            }
            if (provinceName) {
              values.set(provinceName, (values.get(provinceName) || 0) + item.count);
            }
          });
          visits.forEach((item) => {
            if (item.level === 'province') {
              values.set(item.name, (values.get(item.name) || 0) + 1);
            }
          });
        } else {
          features.forEach((feature: any) => {
            const featureName = feature.properties && feature.properties.name;
            const auto = (stats.cities || []).find(
              (item) => normName(item.city) === normName(featureName),
            );
            let count = auto ? auto.count : 0;
            visits.forEach((item) => {
              if (item.level === 'city' && item.name === featureName) count += 1;
            });
            if (count) values.set(featureName, count);
          });
        }

        const data = features.map((feature: any) => {
          const name = feature.properties && feature.properties.name;
          return { name, value: values.get(name) || 0 };
        });
        const max = Math.max(1, ...data.map((item: { value: number }) => item.value));
        chart.setOption({
          tooltip: { trigger: 'item', formatter: '{b}：{c} 次' },
          visualMap: {
            min: 0,
            max,
            left: 10,
            bottom: 10,
            calculable: false,
            inRange: { color: ['#e0f2fe', '#7dd3fc', '#0ea5e9'] },
            textStyle: { color: '#64748b', fontSize: 12 },
          },
          series: [
            {
              type: 'map',
              map: provinceMode ? 'china-provinces' : 'china-cities',
              roam: true,
              label: { show: false },
              itemStyle: { borderColor: '#ffffff', borderWidth: 0.6, areaColor: '#f1f5f9' },
              emphasis: { itemStyle: { areaColor: '#93c5fd' } },
              data,
            },
          ],
        });
      })
      .catch(() => {
        message.error('地图数据加载失败');
      });
    return () => {
      disposed = true;
      if (chart) chart.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats, visits, mapLevel]);

  if (loading) {
    return (
      <div className="page" style={{ textAlign: 'center', paddingTop: 64 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!stats) return null;

  const cityColumns = [
    { title: '城市', dataIndex: 'city', key: 'city' },
    { title: '次数', dataIndex: 'count', key: 'count' },
    { title: '总天数', dataIndex: 'days', key: 'days' },
    {
      title: '首次',
      dataIndex: 'firstVisit',
      key: 'firstVisit',
      render: (value: string) => (value ? value.slice(0, 10) : '—'),
    },
    {
      title: '最近',
      dataIndex: 'lastVisit',
      key: 'lastVisit',
      render: (value: string) => (value ? value.slice(0, 10) : '—'),
    },
  ];

  const isEmpty = stats.tripCount === 0 && visits.length === 0;

  return (
    <div className="page">
      {isEmpty ? (
        <Card>
          <Empty description="还没有旅行数据：去和小忆聊聊，生成第一份攻略，这里就会出现你的旅行足迹。">
            <Button type="primary" onClick={() => navigate('/')}>
              去和小忆聊聊
            </Button>
          </Empty>
        </Card>
      ) : (
        <>
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            <Col xs={12} md={8} lg={4}>
              <Card className="kpi-card" size="small">
                <Statistic title="去过城市" value={stats.cityCount} />
              </Card>
            </Col>
            <Col xs={12} md={8} lg={5}>
              <Card className="kpi-card" size="small">
                <Statistic title="旅行次数" value={stats.tripCount} />
              </Card>
            </Col>
            <Col xs={12} md={8} lg={5}>
              <Card className="kpi-card" size="small">
                <Statistic title="旅行总天数" value={stats.totalDays} />
              </Card>
            </Col>
            <Col xs={12} md={8} lg={5}>
              <Card className="kpi-card" size="small">
                <Statistic
                  title="平均预算"
                  value={stats.avgBudget}
                  prefix="¥"
                  formatter={(value) => fmt(Number(value))}
                />
              </Card>
            </Col>
            <Col xs={12} md={8} lg={5}>
              <Card className="kpi-card" size="small">
                <Statistic title="记忆条数" value={stats.memories} />
              </Card>
            </Col>
          </Row>

          <Card
            title="旅行地图"
            size="small"
            extra={
              <Segmented
                value={mapLevel}
                onChange={(value) => setMapLevel(value as 'province' | 'city')}
                options={[
                  { label: '省级', value: 'province' },
                  { label: '市级', value: 'city' },
                ]}
              />
            }
            style={{ marginBottom: 16 }}
          >
            <div className="map-box" ref={mapRef} />
            <p className="muted" style={{ margin: '8px 0 0' }}>
              点击地图上的省/市，可以手动点亮或取消「去过」。系统也会把已确认的行程自动点亮。
            </p>
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {visits.map((item) => (
                <Tag
                  key={item.level + ':' + item.name}
                  closable
                  onClose={(event) => {
                    event.preventDefault();
                    void toggleVisit(item.name, item.level);
                  }}
                >
                  {item.name}
                  {item.level === 'province' ? '（省）' : '（市）'}
                </Tag>
              ))}
              {visits.length === 0 ? <span className="muted">还没有手动标记。</span> : null}
            </div>
          </Card>

          <Row gutter={[12, 12]}>
            <Col xs={24} md={12}>
              <Card title="去过的城市" size="small">
                <div className="chart-box" ref={cityChartRef} />
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card title="旅行偏好标签" size="small">
                <div className="chart-box" ref={tagChartRef} />
              </Card>
            </Col>
          </Row>

          <Card title="城市足迹明细" size="small" style={{ marginTop: 16 }}>
            <Table
              columns={cityColumns}
              dataSource={stats.cities}
              rowKey="city"
              size="small"
              pagination={false}
              locale={{ emptyText: '暂无数据' }}
            />
          </Card>
        </>
      )}
    </div>
  );
}
