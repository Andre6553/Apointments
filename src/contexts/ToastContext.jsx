import { createContext, useContext, useRef } from 'react'
import Toast from '../components/Toast'

const ToastContext = createContext(null)

export const ToastProvider = ({ children }) => {
    const toastRef = useRef(null)

    const triggerToast = (message, type = 'info', title = null) => {
        toastRef.current?.add(message, type, title)
    }

    return (
        <ToastContext.Provider value={triggerToast}>
            {children}
            <Toast ref={toastRef} />
        </ToastContext.Provider>
    )
}

export const useToast = () => useContext(ToastContext)
