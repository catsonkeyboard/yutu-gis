import { OverlayToaster, Position, Intent, type ToastProps, type Toaster } from '@blueprintjs/core'
import type React from 'react'

let toasterPromise: Promise<Toaster> | null = null
let toasterInstance: Toaster | null = null

export function getAppToaster(): Promise<Toaster> | null {
  if (typeof window === 'undefined') return null
  if (!toasterPromise) {
    toasterPromise = OverlayToaster.create({
      position: Position.TOP,
      maxToasts: 5,
    }).then((t) => {
      toasterInstance = t
      return t
    })
  }
  return toasterPromise
}

async function showToast(props: ToastProps): Promise<string | undefined> {
  if (toasterInstance) {
    return toasterInstance.show(props)
  }
  const t = await getAppToaster()
  return t?.show(props)
}

/**
 * Blueprint-powered message notification service
 * Drop-in replacement for antd message
 */
export const message = {
  success(content: React.ReactNode | string, timeout = 2500) {
    return showToast({
      message: content,
      intent: Intent.SUCCESS,
      icon: 'tick',
      timeout,
    })
  },

  error(content: React.ReactNode | string, timeout = 4000) {
    return showToast({
      message: content,
      intent: Intent.DANGER,
      icon: 'error',
      timeout,
    })
  },

  warning(content: React.ReactNode | string, timeout = 3500) {
    return showToast({
      message: content,
      intent: Intent.WARNING,
      icon: 'warning-sign',
      timeout,
    })
  },

  info(content: React.ReactNode | string, timeout = 3000) {
    return showToast({
      message: content,
      intent: Intent.PRIMARY,
      icon: 'info-sign',
      timeout,
    })
  },

  show(props: ToastProps) {
    return showToast(props)
  },

  async clear() {
    if (toasterInstance) {
      toasterInstance.clear()
    } else {
      const t = await getAppToaster()
      t?.clear()
    }
  }
}
