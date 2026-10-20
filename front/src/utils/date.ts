/**
 * 日期格式化工具函数
 * @param date 可被Date解析的时间格式（时间戳、Date实例、ISO字符串）
 * @param format 格式字符串，默认：'YYYY-MM-DD HH:mm:ss'
 * @returns 格式化后的日期字符串
 */
export function formatDate(
  date: Date | string | number,
  format: string = 'YYYY-MM-DD HH:mm:ss'
): string {
  // 处理各种日期输入类型
  let parsedDate: number;

  if (typeof date === 'string') {
    // 尝试使用 Date.parse 解析 ISO 格式的字符串
    // 将 '-' 替换为 '/' 确保在某些浏览器中能够正确解析
    parsedDate = Date.parse(date.replace(/-/g, '/'));
  } else {
    parsedDate = date instanceof Date ? date.getTime() : date;
  }

  const d = new Date(parsedDate);

  // 检查日期是否有效
  if (isNaN(d.getTime())) {
    console.warn('Invalid date input:', date);
    return 'Invalid Date';
  }

  // 定义补零函数
  const pad = (n: number) => n.toString().padStart(2, '0');

  // 提取日期各部分
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  const seconds = pad(d.getSeconds());

  // 替换格式字符串
  return format
    .replace(/YYYY/g, year.toString())
    .replace(/MM/g, month)
    .replace(/DD/g, day)
    .replace(/HH/g, hours)
    .replace(/mm/g, minutes)
    .replace(/ss/g, seconds);
}



/**
 * 计算相对时间（示例扩展函数）
 * @param timestamp 时间戳
 * @returns 相对时间描述
 */
export function relativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp

  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  const month = 30 * day

  if (diff < minute) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / minute)}分钟前`
  if (diff < day) return `${Math.floor(diff / hour)}小时前`
  if (diff < month) return `${Math.floor(diff / day)}天前`
  
  return formatDate(timestamp, 'YYYY-MM-DD')
}

// 类型导出
export type DateFormatter = typeof formatDate

export function formatTime(dateString: string): string {
    const date = new Date(dateString);
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}