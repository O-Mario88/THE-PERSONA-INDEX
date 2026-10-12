// Proves the test runner itself works, independent of any application code.
describe('test runner', () => {
  it('runs', () => {
    expect(true).toBe(true)
  })

  it('has a DOM in the smoke suite', () => {
    expect(document.body).toBeInTheDocument()
  })
})
