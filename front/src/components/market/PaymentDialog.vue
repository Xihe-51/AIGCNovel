<template>
  <el-dialog
    v-model="visibleModel"
    width="420px"
    class="orange-dialog payment-dialog"
    :close-on-click-modal="false"
  >
    <div class="payment-container">
      <div class="payment-header">
        <h3>{{ resource.title }}</h3>
        <p class="payment-amount">¥{{ Number(resource.price || 0).toFixed(2) }}</p>
      </div>

      <div class="payment-tabs">
        <span
          class="tab"
          :class="{ active: method === 'wechat' }"
          @click="method = 'wechat'"
        >
          <el-icon><ChatDotRound /></el-icon>
          微信支付
        </span>
        <span
          class="tab"
          :class="{ active: method === 'alipay' }"
          @click="method = 'alipay'"
        >
          <el-icon><Wallet /></el-icon>
          支付宝
        </span>
      </div>

      <div class="qr-code-container">
        <div class="qr-wrapper">
          <canvas ref="wechatQrCode" class="qr-code" v-show="method === 'wechat'"></canvas>
          <canvas ref="alipayQrCode" class="qr-code" v-show="method === 'alipay'"></canvas>

          <div v-if="status === 'processing'" class="qr-overlay">
            <el-icon class="spinner"><Loading /></el-icon>
            <p>处理中...</p>
          </div>
          <div v-if="status === 'success'" class="qr-overlay success">
            <el-icon><CircleCheckFilled /></el-icon>
            <p>支付成功</p>
          </div>
        </div>
      </div>

      <div class="payment-footer">
        <p class="countdown" v-if="status === 'scanning'">
          剩余时间: {{ Math.floor(countdown / 60) }}:{{ (countdown % 60).toString().padStart(2, '0') }}
        </p>
        <p class="notice">模拟支付，不会产生真实交易</p>
      </div>
    </div>

    <template #footer>
      <button
        v-if="status === 'scanning'"
        class="dialog-btn confirm"
        @click="simulateScanSuccess"
      >
        模拟扫码成功
      </button>
      <button
        v-if="status === 'scanning'"
        class="dialog-btn cancel"
        @click="cancel"
      >
        取消
      </button>
      <button
        v-if="status === 'success'"
        class="dialog-btn confirm"
        @click="complete"
      >
        完成
      </button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { ChatDotRound, CircleCheckFilled, Loading, Wallet } from '@element-plus/icons-vue'
import QRCode from 'qrcode'
import type { Resource } from '@/api/market'

type PaymentMethod = 'wechat' | 'alipay'
type PaymentStatus = 'scanning' | 'processing' | 'success'

const QR_TIMEOUT_SECONDS = 300
const FAKE_SCAN_DELAY_MS = 1500

const props = defineProps<{
  visible: boolean
  resource: Resource
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'paid'): void
}>()

const visibleModel = computed({
  get: () => props.visible,
  set: (value: boolean) => emit('update:visible', value)
})

const method = ref<PaymentMethod>('wechat')
const status = ref<PaymentStatus>('scanning')
const countdown = ref(QR_TIMEOUT_SECONDS)
const wechatQrCode = ref<HTMLCanvasElement | null>(null)
const alipayQrCode = ref<HTMLCanvasElement | null>(null)

let countdownTimer: ReturnType<typeof setInterval> | null = null
let scanTimer: ReturnType<typeof setTimeout> | null = null

const clearTimers = () => {
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
  if (scanTimer) {
    clearTimeout(scanTimer)
    scanTimer = null
  }
}

const generateQrCode = async () => {
  const text = `payment|${props.resource.resource_id}|${Date.now()}`
  if (wechatQrCode.value) {
    await QRCode.toCanvas(wechatQrCode.value, text, { width: 160, margin: 1 })
  }
  if (alipayQrCode.value) {
    await QRCode.toCanvas(alipayQrCode.value, text, { width: 160, margin: 1 })
  }
}

const startCountdown = () => {
  countdown.value = QR_TIMEOUT_SECONDS
  if (countdownTimer) clearInterval(countdownTimer)
  countdownTimer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) {
      clearTimers()
      ElMessage.error('支付超时')
      visibleModel.value = false
    }
  }, 1000)
}

const reset = () => {
  clearTimers()
  status.value = 'scanning'
  countdown.value = QR_TIMEOUT_SECONDS
}

watch(
  () => props.visible,
  (open: boolean) => {
    if (!open) {
      reset()
      return
    }
    status.value = 'scanning'
    nextTick(() => {
      generateQrCode()
      startCountdown()
    })
  }
)

watch(method, () => {
  status.value = 'scanning'
})

const simulateScanSuccess = () => {
  status.value = 'processing'
  scanTimer = setTimeout(() => {
    status.value = 'success'
    if (countdownTimer) {
      clearInterval(countdownTimer)
      countdownTimer = null
    }
  }, FAKE_SCAN_DELAY_MS)
}

const complete = () => {
  visibleModel.value = false
  emit('paid')
}

const cancel = () => {
  visibleModel.value = false
}

onUnmounted(clearTimers)
</script>

<style scoped lang="scss" src="./paymentDialog.scss"></style>
