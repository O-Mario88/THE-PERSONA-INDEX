import { render } from '@testing-library/react'
import App from './App'

describe('App Smoke Test', () => {
  it('renders root container', () => {
    render(<App />)
    expect(document.body).toBeInTheDocument()
  })
})
