/**
 * 合盛跟单系统 - 共用配置与工具函数
 * 所有页面统一引用此文件
 */

var STEPS_ALL = [
  '接单','调色','制胚','棍花/片桶','切胚','甩干','筛胚',
  '初检','车钮','抛光','终检','包装','出货'
];

var STEPS_STANDARD = [
  '接单','调色','制胚','切胚','甩干','筛胚',
  '初检','车钮','抛光','终检','包装','出货'
];

/**
 * 根据订单产品类型获取对应工序列表
 * 有棍花工艺的产品显示完整13步，否则显示标准12步
 */
function getStepsForOrder(order) {
  // 如果订单明确标注需要棍花工艺，显示棍花步骤
  if (order && (order.hasGunflower || order.needGunflower || order.productType === '棍花')) {
    return STEPS_ALL;
  }
  return STEPS_STANDARD;
}

/**
 * 获取当前工序在工序列表中的索引
 */
function getStepIndex(stepName, steps) {
  var list = steps || STEPS_STANDARD;
  for (var i = 0; i < list.length; i++) {
    if (list[i] === stepName) return i;
  }
  return -1;
}

/**
 * 根据交货日期计算剩余天数
 */
function getDaysLeft(date) {
  if (!date) return 999;
  return Math.ceil((new Date(date) - new Date()) / (1000 * 60 * 60 * 24));
}

/**
 * 格式化时间显示
 */
function formatTime(d) {
  if (!d) return '';
  var date = d instanceof Date ? d : new Date(d);
  var h = date.getHours();
  var m = String(date.getMinutes()).padStart(2, '0');
  var ampm = h >= 12 ? 'PM' : 'AM';
  var h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return date.getFullYear() + '/' + String(date.getMonth() + 1) + '/' + date.getDate() + ' ' + h12 + ':' + m + ' ' + ampm;
}

/**
 * HTML转义，防止XSS
 */
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 获取订单状态分类
 */
function getOrderStatus(o) {
  if (o.isCompleted) return 'completed';
  if (o.isPaused) return 'paused';
  if (o.isUrgent) return 'urgent';
  if (o.currentStep && o.currentStep !== '接单') return 'producing';
  return 'pending';
}

/**
 * 计算订单完成百分比
 */
function getOrderProgress(order, steps) {
  var stepList = steps || getStepsForOrder(order);
  var idx = getStepIndex(order.currentStep, stepList);
  if (idx < 0) idx = 0;
  return Math.round(((idx + 1) / stepList.length) * 100);
}
