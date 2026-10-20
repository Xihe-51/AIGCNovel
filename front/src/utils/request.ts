import axios from "axios"
import { jwtDecode } from "jwt-decode";

const BASE_URL = "http://127.0.0.1:8088";
// const BASE_URL = "http://192.168.0.103:5000";
export { BASE_URL }

const request = axios.create({
  baseURL: BASE_URL
})

// 请求拦截器 - 添加认证信息和用户ID
request.interceptors.request.use(
  config => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;

      // 解码 token 获取 user_id
      try {
        const decodedToken = jwtDecode<{ identity?: string }>(token);
        const userId = decodedToken.identity;
        if (userId) {
          config.headers['X-User-Id'] = userId; // 添加用户ID到请求头
        }
      } catch (error) {
        console.error("Token 解码错误:", error);
      }
    }

    return config;
  },
  error => {
    return Promise.reject(error);
  }
);

export default request

// 响应拦截器：token 过期/失效时清理并回登录页，避免页面静默空白
request.interceptors.response.use(
  response => response,
  error => {
    const status = error?.response?.status
    const url: string = error?.config?.url || ''
    const isAuthApi = url.includes('/user/login') || url.includes('/user/register') ||
      url.includes('/user/forgot_password') || url.includes('/user/reset_password')
    if (status === 401 && !isAuthApi) {
      localStorage.removeItem('token')
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
);