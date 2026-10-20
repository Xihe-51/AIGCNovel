import request from '@/utils/request';

// 定义登录函数
export const login = async (username: string, password: string): Promise<void> => {
  try {
    const response = await request.post('/user/login', {
      username,
      password
    });

    // 登录成功后，保存 token
    const { access_token } = response.data;
    localStorage.setItem('token', access_token);
  } catch (error: any) {
    if (error.response) {
      // 处理服务器返回的错误
      console.error('登录失败:', error.response.data.msg);
      throw new Error(error.response.data.msg);
    } else {
      // 处理其他类型的错误
      console.error('登录请求失败:', error.message);
      throw new Error('登录请求失败');
    }
  }
};

// 定义注册接口
export const register = async (
  email: string,
  password: string,
  username: string,
  phone?: string // phone 是可选参数
): Promise<void> => {
  try {
    const response = await request.post('/user/register', {
      email,
      password,
      username,
      phone
    });

    // 注册成功后的处理
    console.log('注册成功:', response.data.message);
  } catch (error: any) {
    if (error.response) {
      // 处理服务器返回的错误
      console.error('注册失败:', error.response.data.error);
      throw new Error(error.response.data.error);
    } else {
      // 处理其他类型的错误
      console.error('注册请求失败:', error.message);
      throw new Error('注册请求失败');
    }
  }
};

// 发送找回密码验证码
export const forgotPassword = async (email: string): Promise<any> => {
  const response = await request.post('/user/forgot_password', { email });
  return response.data;
};

// 用邮箱 + 验证码重置密码
export const resetPassword = async (
  email: string,
  code: string,
  newPassword: string
): Promise<any> => {
  const response = await request.post('/user/reset_password', {
    email,
    code,
    new_password: newPassword,
  });
  return response.data;
};