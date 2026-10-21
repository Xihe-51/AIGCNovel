import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../views/LoginView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
    	path: '/',
    	redirect: '/login'
    },
	{
		path: '/login',
		name: 'login',
		component: LoginView,
	},
	{
		path: '/home',
		name: 'home',
		component: () => import('../views/HomeView.vue'),
	},
	{
		path: '/ai',
		name: 'ai',
		component: () => import('../views/AiView.vue'),
	},
	{
		path: '/individual',
		name: 'individual',
		component: () => import('../views/IndividualView.vue'),
	},
	{
		path: '/store',
		name: 'store',
		component: () => import('../views/MarketView.vue'),
	},
	{
	    path: '/project/:projectId',
	    name: 'ProjectView',
	    component: () => import('../views/ProjectView.vue'),
	    props: true // 允许将路由参数作为组件的 props 传递
	},
	{
	    path: '/view/:projectId',
	    name: 'View',
	    component: () => import('../views/ExportProject.vue'),
	    props: true // 允许将路由参数作为组件的 props 传递
	},
	{
	    path: '/create/:projectId',
	    name: 'CreateView',
	    component: () => import('../views/CreateView.vue')
	}
  ]
})

// 全局路由守卫：未登录一律回登录页；已登录不再停留在登录页
router.beforeEach((to) => {
	const token = localStorage.getItem('token')
	if (to.path !== '/login' && !token) {
		return { path: '/login', query: { redirect: to.fullPath } }
	}
	if (to.path === '/login' && token) {
		return '/home'
	}
	return true
})

export default router
