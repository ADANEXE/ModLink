import { useState } from 'react';

function formatMoney(amount, currency = 'USD') {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(amount) || 0);
}

export default function AffiliatePanel({ dashboard, onApply, onSignIn, user }) {
  const [reason, setReason] = useState('');
  const [channels, setChannels] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const account = dashboard?.account;
  const application = dashboard?.application;
  const commissions = dashboard?.commissions || [];
  const pendingTotal = commissions
    .filter((commission) => ['pending', 'approved'].includes(commission.status))
    .reduce((total, commission) => total + Number(commission.amount), 0);
  const paidTotal = commissions
    .filter((commission) => commission.status === 'paid')
    .reduce((total, commission) => total + Number(commission.amount), 0);

  async function submitApplication(event) {
    event.preventDefault();
    setBusy(true);
    const submitted = await onApply(reason.trim(), channels.trim());
    setBusy(false);
    if (submitted) {
      setReason('');
      setChannels('');
    }
  }

  async function copyReferralLink() {
    const url = new URL(import.meta.env.BASE_URL, window.location.origin);
    url.searchParams.set('ref', account.referral_code);
    try {
      await navigator.clipboard.writeText(url.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy your ModLink affiliate link:', url.href);
    }
  }

  return (
    <section className="workspace-section affiliate-workspace">
      <div className="section-heading">
        <div>
          <p className="eyebrow">GROW THE COMMUNITY</p>
          <h2>ModLink affiliate program</h2>
          <p className="section-heading__copy">Refer advertisers to ModLink. Owners review qualified referrals and record commission amounts; payouts are handled manually outside the website.</p>
        </div>
      </div>

      {!user ? (
        <article className="panel affiliate-status-card">
          <h3>Join the affiliate program</h3>
          <p>Sign in with Discord to apply, get a referral link after approval, and review your commission ledger.</p>
          <button className="button button--primary" type="button" onClick={onSignIn}>Continue with Discord</button>
        </article>
      ) : account?.status === 'active' ? (
        <>
          <div className="affiliate-summary-grid">
            <article className="panel affiliate-summary"><span>Attributed advertising inquiries</span><strong>{dashboard.referral_count || 0}</strong></article>
            <article className="panel affiliate-summary"><span>Pending / approved commissions</span><strong>{formatMoney(pendingTotal)}</strong></article>
            <article className="panel affiliate-summary"><span>Marked paid</span><strong>{formatMoney(paidTotal)}</strong></article>
          </div>
          <article className="panel affiliate-link-card">
            <div>
              <p className="eyebrow">YOUR TRACKING LINK</p>
              <h3>Share ModLink with potential advertisers</h3>
              <code>{new URL(import.meta.env.BASE_URL, window.location.origin).href}?ref={account.referral_code}</code>
              <small>Referral credit applies when a new advertiser submits an advertising inquiry with your link. Visits alone do not earn commission.</small>
            </div>
            <button className="button button--primary" type="button" onClick={copyReferralLink}>
              {copied ? 'Copied!' : 'Copy affiliate link'}
            </button>
          </article>
        </>
      ) : application?.status === 'pending' ? (
        <article className="panel affiliate-status-card">
          <span className="state-pill state-pill--pending">Application in review</span>
          <h3>Thanks for applying</h3>
          <p>The Owner will review your proposed promotion channels. Your tracking link becomes available after approval.</p>
          <small>Submitted {new Date(application.created_at).toLocaleDateString()}</small>
        </article>
      ) : (
        <form className="panel form-panel affiliate-application" onSubmit={submitApplication}>
          <div>
            <p className="eyebrow">APPLY TO PARTICIPATE</p>
            <h3>Tell us how you’ll refer advertisers</h3>
            <p>Applications are reviewed by the ModLink Owner. Approval gives you a unique link for attributing advertising inquiries.</p>
          </div>
          {application?.status === 'rejected' && <p className="suspension-notice">Your previous application was not approved. You can update your details and apply again.</p>}
          <label className="form-field">
            <span>Where will you promote ModLink?</span>
            <textarea required minLength={5} maxLength={500} rows={3} value={channels} onChange={(event) => setChannels(event.target.value)} placeholder="For example: Discord communities, creator network, or a website you manage." />
          </label>
          <label className="form-field">
            <span>Why would you like to join?</span>
            <textarea required minLength={20} maxLength={1000} rows={4} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Describe the advertisers or community partners you can introduce." />
          </label>
          <p className="affiliate-terms">Commissions are not automatic. The Owner reviews attributed inquiries, enters the actual approved USD commission, and manually marks payment after paying it externally. Do not promise rates or payouts on behalf of ModLink.</p>
          <button className="button button--primary" type="submit" disabled={busy || reason.trim().length < 20 || channels.trim().length < 5}>
            {busy ? 'Submitting application…' : 'Submit affiliate application'}
          </button>
        </form>
      )}

      {account && commissions.length > 0 && (
        <section className="affiliate-commissions">
          <div className="subsection-heading"><h3>Commission history</h3><span>{commissions.length}</span></div>
          <div className="panel-list">
            {commissions.map((commission) => (
              <article className="panel affiliate-commission" key={commission.id}>
                <div>
                  <strong>{commission.description}</strong>
                  <small>{new Date(commission.created_at).toLocaleDateString()} · Recorded by {commission.recorded_by || 'ModLink Owner'}</small>
                  {commission.status === 'paid' && <small>Paid by {commission.paid_by || 'ModLink Owner'}</small>}
                  {commission.notes && <p>{commission.notes}</p>}
                </div>
                <strong>{formatMoney(commission.amount, commission.currency)}</strong>
                <span className={`state-pill state-pill--${commission.status === 'paid' ? 'accepted' : commission.status === 'void' ? 'rejected' : commission.status === 'approved' ? 'open' : 'pending'}`}>{commission.status}</span>
              </article>
            ))}
          </div>
        </section>
      )}

      {!account && application?.status === 'approved' && (
        <article className="panel affiliate-status-card">
          <span className="state-pill state-pill--pending">Affiliate account setup pending</span>
          <p>Your application is approved. Please refresh shortly to load your referral link.</p>
        </article>
      )}
    </section>
  );
}
