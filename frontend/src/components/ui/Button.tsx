import React, { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  children: ReactNode;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  children,
  leftIcon,
  rightIcon,
  disabled,
  className = '',
  ...props
}) => {
  const baseClasses = `
    inline-flex items-center justify-center font-medium rounded-lg 
    transition-all duration-200 ease-in-out focus:outline-none focus:ring-2 
    focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed
    active:scale-95 transform
  `;
  
  const variantClasses = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500 shadow-md hover:shadow-lg',
    secondary: 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 focus:ring-blue-500 shadow-sm hover:shadow-md',
    ghost: 'bg-transparent text-gray-600 hover:bg-gray-100 border-0 shadow-none',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 shadow-md hover:shadow-lg'
  };

  const sizeClasses = {
    sm: 'px-3 py-2 text-xs',
    md: 'px-6 py-3 text-sm',
    lg: 'px-8 py-4 text-base'
  };

  const isDisabled = disabled || loading;

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`.trim()}
      disabled={isDisabled}
      {...props}
    >
      {loading ? (
        <>
          <span className="spinner mr-2"></span>
          {typeof children === 'string' ? 'Loading...' : children}
        </>
      ) : (
        <>
          {leftIcon && <span className="mr-2">{leftIcon}</span>}
          {children}
          {rightIcon && <span className="ml-2">{rightIcon}</span>}
        </>
      )}
    </button>
  );
};

export default Button; 