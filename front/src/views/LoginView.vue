<template>
	<div class="login-container">
		<!-- 背景特效 -->
		<div class="background-effects">
			<div class="effect-circle pink"></div>
			<div class="effect-circle light-pink"></div>
			<div class="effect-circle purple"></div>
			<div class="effect-bubble"></div>
			<div class="effect-bubble"></div>
			<div class="effect-bubble"></div>
		</div>

		<div class="login-box">
			<!-- 标题和切换按钮 -->
			<div class="header">
				<h1 class="title">织梦数域 AIGC视觉小说系统</h1>
				<div class="mode-switch">
					<el-button :class="activeTab === 'login' ? 'active-tab' : 'inactive-tab'"
						@click="activeTab = 'login'" class="mode-button">
						登录
					</el-button>
					<el-button :class="activeTab === 'register' ? 'active-tab' : 'inactive-tab'"
						@click="activeTab = 'register'" class="mode-button">
						注册
					</el-button>
				</div>
			</div>

			<!-- 登录表单 -->
			<el-form v-show="activeTab === 'login'" :model="loginForm" :rules="loginRules" ref="loginFormRef"
				class="form" @keyup.enter="handleLogin">
				<el-form-item prop="username">
					<el-input v-model="loginForm.username" placeholder="用户名" prefix-icon="User" size="large" />
				</el-form-item>

				<el-form-item prop="password">
					<el-input v-model="loginForm.password" type="password" placeholder="密码" prefix-icon="Lock"
						size="large" show-password />
				</el-form-item>

				<div class="forgot-password" @click="openForgotPassword">
					<el-icon>
						<QuestionFilled />
					</el-icon>
					<span>忘记密码?</span>
				</div>

				<el-button type="primary" size="large" @click="handleLogin" class="submit-button" :loading="loading">
					登录
				</el-button>
			</el-form>

			<!-- 注册表单 -->
			<el-form v-show="activeTab === 'register'" :model="registerForm" :rules="registerRules"
				ref="registerFormRef" class="form" @keyup.enter="handleRegister">
				<el-form-item prop="username">
					<el-input v-model="registerForm.username" placeholder="用户名" prefix-icon="User" size="large" />
				</el-form-item>

				<el-form-item prop="email">
					<el-input v-model="registerForm.email" placeholder="邮箱" prefix-icon="Message" size="large" />
				</el-form-item>

				<el-form-item prop="phone">
					<el-input v-model="registerForm.phone" placeholder="手机号 (可选)" prefix-icon="Iphone" size="large" />
				</el-form-item>

				<el-form-item prop="password">
					<el-input v-model="registerForm.password" type="password" placeholder="密码" prefix-icon="Lock"
						size="large" show-password />
				</el-form-item>

				<el-form-item prop="confirmPassword">
					<el-input v-model="registerForm.confirmPassword" type="password" placeholder="确认密码"
						prefix-icon="Lock" size="large" show-password />
				</el-form-item>

				<el-button type="primary" size="large" @click="handleRegister" class="submit-button" :loading="loading">
					注册
				</el-button>
			</el-form>
		</div>

		<!-- 忘记密码对话框 -->
		<el-dialog v-model="showForgotPassword" title="找回密码" width="400px" class="forgot-password-dialog">
			<div class="forgot-password-content">
				<el-steps :active="forgotStep" align-center>
					<el-step title="验证身份" />
					<el-step title="重置密码" />
					<el-step title="完成" />
				</el-steps>

				<div v-if="forgotStep === 1" class="step-content">
					<p>请输入您的注册邮箱，我们将发送验证码</p>
					<el-input v-model="forgotEmail" placeholder="请输入邮箱" prefix-icon="Message" class="step-input" />
				</div>

				<div v-if="forgotStep === 2" class="step-content">
					<p>请输入收到的验证码和新密码</p>
					<el-input v-model="forgotCode" placeholder="验证码" prefix-icon="Key" class="step-input" />
					<el-input v-model="forgotNewPassword" type="password" placeholder="新密码" prefix-icon="Lock"
						class="step-input" show-password />
				</div>

				<div v-if="forgotStep === 3" class="step-success">
					<el-icon color="#67C23A" size="60px">
						<CircleCheckFilled />
					</el-icon>
					<p>密码重置成功！</p>
				</div>

				<div class="step-actions">
					<el-button v-if="forgotStep > 1 && forgotStep < 3" @click="forgotStep--" class="step-button">
						上一步
					</el-button>
					<el-button v-if="forgotStep < 3" type="primary" @click="handleForgotNext"
						:loading="forgotLoading" class="step-button">
						{{ forgotStep === 1 ? '发送验证码' : '重置密码' }}
					</el-button>
					<el-button v-if="forgotStep === 3" type="primary" @click="showForgotPassword = false"
						class="step-button">
						完成
					</el-button>
				</div>
			</div>
		</el-dialog>
	</div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { login as apiLogin, register as apiRegister, forgotPassword, resetPassword } from '@/api/login'
import { useRouter } from 'vue-router'
import { extractErrorMessage } from '@/utils/errorMessage'

const router = useRouter()

// 登录注册切换
const activeTab = ref<'login' | 'register'>('login')

// 登录表单
const loginForm = ref({
  username: '',
  password: ''
})

const loginFormRef = ref<FormInstance>()
const loginRules = ref<FormRules>({
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 3, max: 16, message: '长度在 3 到 16 个字符', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, max: 20, message: '长度在 6 到 20 个字符', trigger: 'blur' }
  ]
})

// 注册表单
const registerForm = ref({
  username: '',
  email: '',
  phone: '',
  password: '',
  confirmPassword: ''
})

const registerFormRef = ref<FormInstance>()
const registerRules = ref<FormRules>({
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 3, max: 16, message: '长度在 3 到 16 个字符', trigger: 'blur' }
  ],
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '请输入正确的邮箱地址', trigger: ['blur', 'change'] }
  ],
  phone: [
    { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, max: 20, message: '长度在 6 到 20 个字符', trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: '请再次输入密码', trigger: 'blur' },
    { validator: validatePassword, trigger: 'blur' }
  ]
})

function validatePassword(rule: any, value: string, callback: any) {
  if (value !== registerForm.value.password) {
    callback(new Error('两次输入密码不一致!'))
  } else {
    callback()
  }
}

// 忘记密码
const showForgotPassword = ref(false)
const forgotStep = ref(1)
const forgotEmail = ref('')
const forgotCode = ref('')
const forgotNewPassword = ref('')
const forgotLoading = ref(false)

const openForgotPassword = () => {
  forgotStep.value = 1
  forgotCode.value = ''
  forgotNewPassword.value = ''
  showForgotPassword.value = true
}

// 找回密码：真正调用后端接口（此前只是点两下就显示“成功”）
const handleForgotNext = async () => {
  const email = forgotEmail.value.trim()
  if (forgotStep.value === 1) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      ElMessage.warning('请输入有效的邮箱地址')
      return
    }
    forgotLoading.value = true
    try {
      const res = await forgotPassword(email)
      const debugCode = res?.data?.debug_code
      if (debugCode) {
        forgotCode.value = debugCode
        ElMessage.info('开发模式未配置邮件服务，验证码已自动填入')
      } else {
        ElMessage.success(res?.message || '验证码已发送')
      }
      forgotStep.value = 2
    } catch (error: any) {
      ElMessage.error(extractErrorMessage(error, '验证码发送失败'))
    } finally {
      forgotLoading.value = false
    }
    return
  }

  if (forgotStep.value === 2) {
    if (!forgotCode.value.trim()) {
      ElMessage.warning('请输入验证码')
      return
    }
    if (forgotNewPassword.value.length < 6) {
      ElMessage.warning('新密码至少 6 位')
      return
    }
    forgotLoading.value = true
    try {
      const res = await resetPassword(email, forgotCode.value.trim(), forgotNewPassword.value)
      ElMessage.success(res?.message || '密码重置成功')
      forgotStep.value = 3
    } catch (error: any) {
      ElMessage.error(extractErrorMessage(error, '密码重置失败'))
    } finally {
      forgotLoading.value = false
    }
  }
}

// 加载状态
const loading = ref(false)

// 登录方法
const handleLogin = async () => {
  try {
    await loginFormRef.value?.validate()
    loading.value = true
    
    // 调用登录API
    await apiLogin(loginForm.value.username, loginForm.value.password)
	
    ElMessage.success('登录成功')
    router.push('/home')
  } catch (error) {
    console.error('登录失败:', error)
    ElMessage.error('登录失败，请检查用户名和密码')
  } finally {
    loading.value = false
  }
}

// 注册方法
const handleRegister = async () => {
  try {
    await registerFormRef.value?.validate()
    loading.value = true
	
	await apiRegister(registerForm.value.email, registerForm.value.password, registerForm.value.username, registerForm.value.phone)
    ElMessage.success('注册成功')
    activeTab.value = 'login'
    registerFormRef.value?.resetFields()
  } catch (error) {
    console.error('注册失败:', error)
    ElMessage.error('注册失败，请检查输入信息')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
	const token = localStorage.getItem('token');
	if (token) {
		router.push('/home');
	}
})
</script>

<style scoped lang="scss" src="./loginView.scss"></style>