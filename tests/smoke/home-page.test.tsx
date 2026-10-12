import { render, screen } from '@testing-library/react'
import HomePage from '@/app/page'

describe('home page', () => {
  it('renders the product name', () => {
    render(<HomePage />)
    expect(screen.getByRole('heading', { name: 'The Persona Index' })).toBeInTheDocument()
  })
})
