const invoices = [
  {
    amount: '€25,000.00',
    due: 'Today',
    finding: 'Beneficiary changed',
    invoice: 'CG-2026-0718',
    route: '2 approvals',
    state: 'review',
    supplier: 'CourtGlass Iberia',
  },
  {
    amount: '€684.20',
    due: '26 Jul',
    finding: 'Exact recurring match',
    invoice: 'LS-2026-7741',
    route: 'Standing mandate',
    state: 'ready',
    supplier: 'LimpoSete Facilities',
  },
  {
    amount: '€3,941.87',
    due: '28 Jul',
    finding: '17% above normal',
    invoice: 'AE-2026-83491',
    route: 'AP review',
    state: 'review',
    supplier: 'Atlântico Energia',
  },
  {
    amount: '€1,286.40',
    due: '30 Jul',
    finding: 'Duplicate document',
    invoice: 'SP-2026-7781',
    route: 'Blocked',
    state: 'blocked',
    supplier: 'SportPro Iberia',
  },
] as const;

const policyChecks = [
  ['Supplier record active', 'pass'],
  ['Invoice number unique', 'pass'],
  ['Purchase order matched', 'pass'],
  ['Beneficiary matches supplier', 'fail'],
  ['Amount inside auto-pay cap', 'fail'],
] as const;

export default function HomePage() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="wordmark">
          <span aria-hidden="true">IG</span>
          <div>
            <strong>InvoiceGuard</strong>
            <small>Accounts payable</small>
          </div>
        </div>

        <nav aria-label="Primary navigation">
          <a className="active" href="#invoices">
            Invoice inbox <span>14</span>
          </a>
          <span aria-disabled="true" className="nav-placeholder">
            Suppliers
          </span>
          <span aria-disabled="true" className="nav-placeholder">
            Policies
          </span>
          <span aria-disabled="true" className="nav-placeholder">
            Payments
          </span>
          <span aria-disabled="true" className="nav-placeholder">
            Control evidence
          </span>
        </nav>

        <div className="tenant">
          <span>LX</span>
          <div>
            <strong>Lx Padel Operations</strong>
            <small>Synthetic demo company</small>
          </div>
        </div>
      </aside>

      <main>
        <div className="mode-banner" role="status">
          Synthetic data · sponsor adapters inactive · no payment path
        </div>

        <header className="page-header">
          <div>
            <p className="eyebrow">Synthetic AP workspace</p>
            <h1>Invoice inbox</h1>
            <p>
              Agents clear routine invoices. Your team handles the exceptions.
            </p>
          </div>
          <button disabled type="button">
            Import unavailable
          </button>
        </header>

        <section className="metrics" aria-label="Invoice queue summary">
          <article>
            <span>Received this month</span>
            <strong>100</strong>
            <small>Synthetic workload</small>
          </article>
          <article>
            <span>Ready under mandate</span>
            <strong>86</strong>
            <small>Exact policy match</small>
          </article>
          <article>
            <span>Needs review</span>
            <strong>12</strong>
            <small>Human decision required</small>
          </article>
          <article>
            <span>Blocked</span>
            <strong>2</strong>
            <small>No payment permitted</small>
          </article>
        </section>

        <div className="workspace">
          <section className="queue-card" id="invoices">
            <div className="section-heading">
              <div>
                <h2>Representative invoices</h2>
                <p>Four policy outcomes from the synthetic batch</p>
              </div>
              <span className="count">4 of 100</span>
            </div>

            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Supplier</th>
                    <th>Due</th>
                    <th>Amount</th>
                    <th>Finding</th>
                    <th>Route</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice, index) => (
                    <tr
                      className={index === 0 ? 'selected' : ''}
                      key={invoice.invoice}
                    >
                      <td>
                        <strong>{invoice.supplier}</strong>
                        <small>{invoice.invoice}</small>
                      </td>
                      <td>{invoice.due}</td>
                      <td className="amount">{invoice.amount}</td>
                      <td>
                        <span className={`status ${invoice.state}`}>
                          {invoice.finding}
                        </span>
                      </td>
                      <td>{invoice.route}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <aside className="exception-card" aria-labelledby="exception-title">
            <div className="exception-heading">
              <span className="status review">Beneficiary changed</span>
              <span>Due today</span>
            </div>
            <h2 id="exception-title">CourtGlass Iberia</h2>
            <p className="invoice-meta">CG-2026-0718 · €25,000.00</p>

            <div className="beneficiary-diff">
              <div>
                <span>Approved record</span>
                <code>PT50 ···· ···· 1284</code>
              </div>
              <div>
                <span>Invoice proposes</span>
                <code>PT91 ···· ···· 7782</code>
              </div>
            </div>

            <h3>Policy trace</h3>
            <ul className="policy-list">
              {policyChecks.map(([label, result]) => (
                <li key={label}>
                  <span>{label}</span>
                  <strong className={result}>
                    {result === 'pass' ? 'Pass' : 'Exception'}
                  </strong>
                </li>
              ))}
            </ul>

            <div className="decision">
              <span>Route</span>
              <strong>Accounts Payable + Treasury</strong>
              <small>
                Exact action is not frozen in this foundation build.
              </small>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
