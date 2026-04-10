/**
 * 合盛跟单系统 - 后端服务器
 * 作用：前端代理 + 订单写入 + 飞书数据拉取
 */

const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());

// 托管静态文件（同源，无跨域）
app.use(express.static(path.join(__dirname)));

// 根路径返回 index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 路由映射：URL路径 → 对应HTML文件
const routeMap = {
  '/dashboard': 'dashboard.html',
  '/order-pro-a': 'order-pro-a.html',
  '/order-pro': 'order-pro-a.html',
  '/process': 'processCenter.html',
  '/processCenter': 'processCenter.html',
  '/customer-track': 'customer-track.html',
  '/customer_track': 'customer-track.html',
  '/track': 'track.html',
  '/app': 'app.html',
};

// 通用路由：检查 routeMap，没有就加 .html 后缀
app.get('/:page', (req, res, next) => {
  const page = '/' + req.params.page;
  let file = routeMap[page] || (page + '.html');
  const filePath = path.join(__dirname, file);
  res.sendFile(filePath, (err) => {
    if (err) next();
  });
});

// ========== 飞书配置 ==========
const FS_APP_TOKEN = process.env.FS_APP_TOKEN || 'ZXaCbhbaOaUylfsznlRcICJSnMh';
const FS_APP_ID = process.env.FS_APP_ID || 'cli_a94bdf0fc3b89bb7';
const FS_APP_SECRET = process.env.FS_APP_SECRET || 'p8QsSAq2zb8dVazJkE487gXkFVQx3Mr3';

// 飞书多维表格表ID
const FS_PROD_TABLE = 'tblulFnP5TbawnY1'; // 生产管理
const FS_ORDER_TABLE = 'tbl5h2tvRGJ86POP'; // 订单管理
const FS_CUST_TABLE = 'tblMqxTf98wrJRo3'; // 客户信息
const FS_PROD_INFO_TABLE = 'tblabu9EcSNhQWZg'; // 产品信息
const FS_INV_TABLE = 'tbljcHJOCAMHfPdx'; // 出入库管理

let fsAccessToken = null;
let fsTokenExpiry = 0;

// ========== 飞书 API 工具 ==========

async function getFeishuToken() {
  if (fsAccessToken && Date.now() < fsTokenExpiry) return fsAccessToken;
  try {
    const r = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: FS_APP_ID, app_secret: FS_APP_SECRET })
    });
    const d = await r.json();
    if (d.tenant_access_token) {
      fsAccessToken = d.tenant_access_token;
      fsTokenExpiry = Date.now() + (d.expire - 60) * 1000;
      return fsAccessToken;
    }
  } catch (e) {
    console.error('获取飞书Token失败:', e);
  }
  return null;
}

async function feishuGet(path) {
  const token = await getFeishuToken();
  if (!token) throw new Error('无法获取飞书access_token');
  const r = await fetch('https://open.feishu.cn/open-apis' + path, {
    headers: { Authorization: 'Bearer ' + token }
  });
  return r.json();
}

async function feishuPost(path, body) {
  const token = await getFeishuToken();
  if (!token) throw new Error('无法获取飞书access_token');
  const r = await fetch('https://open.feishu.cn/open-apis' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify(body)
  });
  return r.json();
}

// ========== API 接口 ==========

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// 获取飞书 Token 状态（供前端检查连接）
app.get('/api/fs_status', async (req, res) => {
  const token = await getFeishuToken();
  res.json({ connected: !!token });
});

// 获取生产订单列表
app.get('/api/prod_orders', async (req, res) => {
  try {
    const data = await feishuGet('/bitable/v1/apps/' + FS_APP_TOKEN + '/tables/' + FS_PROD_TABLE + '/records?page_size=100');
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 获取订单列表
app.get('/api/orders', async (req, res) => {
  try {
    const data = await feishuGet('/bitable/v1/apps/' + FS_APP_TOKEN + '/tables/' + FS_ORDER_TABLE + '/records?page_size=200');
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 获取客户列表
app.get('/api/customers', async (req, res) => {
  try {
    const data = await feishuGet('/bitable/v1/apps/' + FS_APP_TOKEN + '/tables/' + FS_CUST_TABLE + '/records?page_size=100');
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 获取产品列表
app.get('/api/products', async (req, res) => {
  try {
    const data = await feishuGet('/bitable/v1/apps/' + FS_APP_TOKEN + '/tables/' + FS_PROD_INFO_TABLE + '/records?page_size=100');
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 获取库存数据
app.get('/api/inventory', async (req, res) => {
  try {
    const data = await feishuGet('/bitable/v1/apps/' + FS_APP_TOKEN + '/tables/' + FS_INV_TABLE + '/records?page_size=100');
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 获取单个订单进度（供客户查询页 track.html 使用）
app.get('/api/order/:orderId', async (req, res) => {
  try {
    // 先在订单表里查找该订单号
    const orderData = await feishuGet('/bitable/v1/apps/' + FS_APP_TOKEN + '/tables/' + FS_ORDER_TABLE + '/records?page_size=200');
    const order = (orderData.data?.items || []).find(item => {
      const f = item.fields;
      // 订单号可能在 "订单号" 字段（公式）或 "客户查询码" 字段
      return (f['订单号'] && f['订单号'].includes(req.params.orderId)) ||
             (f['客户查询码'] && f['客户查询码'].includes(req.params.orderId));
    });
    if (!order) return res.status(404).json({ error: '订单未找到' });

    // 查找对应的生产单
    const prodData = await feishuGet('/bitable/v1/apps/' + FS_APP_TOKEN + '/tables/' + FS_PROD_TABLE + '/records?page_size=100');
    const prodOrder = (prodData.data?.items || []).find(item => {
      const link = item.fields['关联订单'];
      if (!link) return false;
      const linkId = link.record_id || (link.text || '');
      return linkId === order.record_id || linkId.includes(order.record_id);
    });

    res.json({
      order: order.fields,
      production: prodOrder ? prodOrder.fields : null
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== 订单相关 ==========

// 创建生产单
app.post('/api/create_prod_order', async (req, res) => {
  try {
    const { orderNumber, customerId, productId, quantity, deliveryDate, currentStep,remark } = req.body;
    const fields = {
      '生产单': orderNumber,
      '当前工序': currentStep || '接单',
      '数量(G)': parseFloat(quantity) || 0,
      '要求交货时间': deliveryDate || null,
      '备注': remark || ''
    };
    if (customerId) fields['关联订单'] = [{ type: 'bitable', table_id: FS_ORDER_TABLE, record_id: customerId }];
    
    const data = await feishuPost('/bitable/v1/apps/' + FS_APP_TOKEN + '/tables/' + FS_PROD_TABLE + '/records', {
      fields
    });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 创建订单（订单管理表）
app.post('/api/create_order', async (req, res) => {
  try {
    const { customerId, productId, quantity, deliveryDate, signDate } = req.body;
    const fields = {
      '数量': parseFloat(quantity) || 0,
    };
    if (deliveryDate) fields['要求交货时间'] = new Date(deliveryDate);
    if (signDate) fields['签约日期'] = new Date(signDate);
    
    if (customerId) {
      fields['客户编号'] = [{ type: 'bitable', table_id: FS_CUST_TABLE, record_id: customerId }];
    }
    if (productId) {
      fields['产品编号'] = [{ type: 'bitable', table_id: FS_PROD_INFO_TABLE, record_id: productId }];
    }
    
    const data = await feishuPost('/bitable/v1/apps/' + FS_APP_TOKEN + '/tables/' + FS_ORDER_TABLE + '/records', {
      fields
    });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 更新生产工序状态
app.patch('/api/update_prod_step/:recordId', async (req, res) => {
  try {
    const { recordId } = req.params;
    const { currentStep, completed, finishedQty } = req.body;
    const fields = {};
    if (currentStep) fields['当前工序'] = currentStep;
    if (typeof completed === 'boolean') fields['完工入库'] = completed;
    if (finishedQty !== undefined) fields['完工数量'] = parseFloat(finishedQty);
    
    const token = await getFeishuToken();
    const r = await fetch('https://open.feishu.cn/open-apis/bitable/v1/apps/' + FS_APP_TOKEN + '/tables/' + FS_PROD_TABLE + '/records/' + recordId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ fields })
    });
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ========== 静态文件服务（开发/调试用） ==========
// 生产环境建议用 nginx 托管静态文件

// 托管静态文件 + API 同源部署（端口 3000）
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`合盛跟单系统已启动 http://120.79.180.199:${PORT}`);
  console.log(`飞书 App Token: ${FS_APP_TOKEN}`);
});
