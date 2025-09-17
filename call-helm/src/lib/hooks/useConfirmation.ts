import { useState } from 'react'

export interface ConfirmationState {
  isOpen: boolean
  title: string
  description: string
  confirmText?: string
  cancelText?: string
  variant?: 'default' | 'destructive' | 'warning' | 'info' | 'success'
  onConfirm?: () => void | Promise<void>
}

export function useConfirmation() {
  const [state, setState] = useState<ConfirmationState>({
    isOpen: false,
    title: '',
    description: '',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    variant: 'default'
  })
  const [isLoading, setIsLoading] = useState(false)

  const showConfirmation = (options: Omit<ConfirmationState, 'isOpen'> & { isOpen?: boolean }) => {
    setState({
      ...options,
      isOpen: true
    })
  }

  const hideConfirmation = () => {
    setState(prev => ({
      ...prev,
      isOpen: false
    }))
    setIsLoading(false)
  }

  const handleConfirm = async () => {
    if (state.onConfirm) {
      try {
        setIsLoading(true)
        await state.onConfirm()
        hideConfirmation()
      } catch (error) {
        setIsLoading(false)
        // Let the calling component handle the error
        throw error
      }
    } else {
      hideConfirmation()
    }
  }

  return {
    ...state,
    isLoading,
    showConfirmation,
    hideConfirmation,
    handleConfirm
  }
}