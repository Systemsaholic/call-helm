"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface InputOTPProps {
  maxLength: number
  value: string
  onChange: (value: string) => void
  children?: React.ReactNode
}

interface InputOTPContextValue {
  value: string
  onChange: (value: string) => void
  slots: string[]
  setSlotValue: (index: number, value: string) => void
}

const InputOTPContext = React.createContext<InputOTPContextValue | null>(null)

export function InputOTP({ maxLength, value, onChange, children }: InputOTPProps) {
  const slots = React.useMemo(() => {
    const arr = value.split('')
    while (arr.length < maxLength) {
      arr.push('')
    }
    return arr.slice(0, maxLength)
  }, [value, maxLength])

  const setSlotValue = React.useCallback((index: number, slotValue: string) => {
    const newSlots = [...slots]
    newSlots[index] = slotValue
    onChange(newSlots.join(''))
  }, [slots, onChange])

  return (
    <InputOTPContext.Provider value={{ value, onChange, slots, setSlotValue }}>
      <div className="flex gap-2">
        {children}
      </div>
    </InputOTPContext.Provider>
  )
}

export function InputOTPGroup({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-2">{children}</div>
}

export function InputOTPSlot({ index }: { index: number }) {
  const context = React.useContext(InputOTPContext)
  if (!context) throw new Error('InputOTPSlot must be used within InputOTP')

  const { slots, setSlotValue } = context
  const value = slots[index] || ''
  const inputRef = React.useRef<HTMLInputElement>(null)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value.slice(-1)
    if (/^\d*$/.test(newValue)) {
      setSlotValue(index, newValue)
      
      // Auto-focus next input
      if (newValue && index < slots.length - 1) {
        const nextInput = document.querySelector(`[data-otp-index="${index + 1}"]`) as HTMLInputElement
        nextInput?.focus()
      }
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !value && index > 0) {
      const prevInput = document.querySelector(`[data-otp-index="${index - 1}"]`) as HTMLInputElement
      prevInput?.focus()
    } else if (e.key === 'ArrowLeft' && index > 0) {
      const prevInput = document.querySelector(`[data-otp-index="${index - 1}"]`) as HTMLInputElement
      prevInput?.focus()
    } else if (e.key === 'ArrowRight' && index < slots.length - 1) {
      const nextInput = document.querySelector(`[data-otp-index="${index + 1}"]`) as HTMLInputElement
      nextInput?.focus()
    }
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData('text/plain').replace(/\D/g, '')
    const newSlots = [...slots]
    
    for (let i = 0; i < pastedData.length && index + i < slots.length; i++) {
      newSlots[index + i] = pastedData[i]
    }
    
    context.onChange(newSlots.join(''))
    
    // Focus the next empty slot or the last slot
    const nextEmptyIndex = newSlots.findIndex((s, i) => i >= index && !s)
    const focusIndex = nextEmptyIndex !== -1 ? nextEmptyIndex : Math.min(index + pastedData.length, slots.length - 1)
    const targetInput = document.querySelector(`[data-otp-index="${focusIndex}"]`) as HTMLInputElement
    targetInput?.focus()
  }

  return (
    <input
      ref={inputRef}
      data-otp-index={index}
      type="text"
      inputMode="numeric"
      pattern="\d*"
      maxLength={1}
      value={value}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      className={cn(
        "w-10 h-12 text-center border border-input rounded-md",
        "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        "text-lg font-medium"
      )}
    />
  )
}

export function InputOTPSeparator() {
  return <div className="flex items-center">-</div>
}