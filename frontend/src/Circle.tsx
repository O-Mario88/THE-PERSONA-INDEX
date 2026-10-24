// The Circle tab. Accounts and the circle come in the next stage; until
// then it says what the circle will be.

export function CircleScreen() {
  return (
    <section className="circle" aria-labelledby="circle-title">
      <header className="page-head">
        <p className="label">Your circle</p>
        <h2 id="circle-title" className="display">
          Your circle
        </h2>
      </header>
      <p className="muted">Three friends unlock your Outside Mirror: how the people around you experience you.</p>
    </section>
  )
}
