import { forwardRef } from 'react'
import { Link } from 'react-router-dom'
import { btnClass } from './buttonStyles.js'

/** @type {import('react').ForwardRefExoticComponent<import('./Button.jsx').ButtonProps & import('react').RefAttributes<HTMLButtonElement>>} */
export const Button = forwardRef(function Button(
  { variant = 'ghost', size = 'md', className, type = 'button', ...props },
  ref,
) {
  return (
    <button ref={ref} type={type} className={btnClass(variant, size, className)} {...props} />
  )
})

/** @type {import('react').ForwardRefExoticComponent<import('./Button.jsx').ButtonProps & import('react').RefAttributes<HTMLButtonElement>>} */
export const IconButton = forwardRef(function IconButton(
  { variant = 'ghost', className, type = 'button', ...props },
  ref,
) {
  return (
    <button ref={ref} type={type} className={btnClass(variant, 'icon', className)} {...props} />
  )
})

export function ButtonLink({ variant = 'ghost', size = 'md', className, ...props }) {
  return <Link className={btnClass(variant, size, className)} {...props} />
}

/**
 * @typedef {object} ButtonProps
 * @property {import('./buttonStyles.js').ButtonVariant} [variant]
 * @property {import('./buttonStyles.js').ButtonSize} [size]
 * @property {string} [className]
 * @property {import('react').ButtonHTMLAttributes<HTMLButtonElement>['type']} [type]
 */
