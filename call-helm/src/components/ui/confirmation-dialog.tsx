'use client'

import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { AlertTriangle, Trash2, Info, CheckCircle, XCircle } from 'lucide-react'

export interface ConfirmationDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: string
  confirmText?: string
  cancelText?: string
  variant?: 'default' | 'destructive' | 'warning' | 'info' | 'success'
  isLoading?: boolean
}

const variantStyles = {
  default: {
    icon: Info,
    iconColor: 'text-blue-500',
    confirmButtonClass: 'bg-blue-600 hover:bg-blue-700'
  },
  destructive: {
    icon: Trash2,
    iconColor: 'text-red-500',
    confirmButtonClass: 'bg-red-600 hover:bg-red-700'
  },
  warning: {
    icon: AlertTriangle,
    iconColor: 'text-yellow-500',
    confirmButtonClass: 'bg-yellow-600 hover:bg-yellow-700'
  },
  info: {
    icon: Info,
    iconColor: 'text-blue-500',
    confirmButtonClass: 'bg-blue-600 hover:bg-blue-700'
  },
  success: {
    icon: CheckCircle,
    iconColor: 'text-green-500',
    confirmButtonClass: 'bg-green-600 hover:bg-green-700'
  }
}

export function ConfirmationDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'default',
  isLoading = false
}: ConfirmationDialogProps) {
  const { icon: Icon, iconColor, confirmButtonClass } = variantStyles[variant]

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent className="sm:max-w-[425px]">
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <div className={`flex-shrink-0 ${iconColor}`}>
              <Icon className="h-6 w-6" />
            </div>
            <div>
              <AlertDialogTitle className="text-left">
                {title}
              </AlertDialogTitle>
            </div>
          </div>
          <AlertDialogDescription className="text-left mt-2">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogCancel 
            onClick={onClose}
            disabled={isLoading}
            className="w-full sm:w-auto"
          >
            {cancelText}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isLoading}
            className={`w-full sm:w-auto ${confirmButtonClass} text-white`}
          >
            {isLoading ? (
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Loading...
              </div>
            ) : (
              confirmText
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}