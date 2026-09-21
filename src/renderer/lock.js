const titles = {
  killed: 'This license was revoked.',
  clock_rollback: 'The clock on this computer looks wrong.',
  lease_expired: 'The license lease has expired.',
  trial_expired: 'The trial has ended.',
  seat_limit: 'This key is already on too many computers.',
  no_lease: 'This computer is not licensed.',
};

async function paint() {
  const snap = await window.ledger.license();
  document.getElementById('title').textContent = titles[snap.reason] || titles.no_lease;
  if (snap.warn) return;
}

document.getElementById('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = document.getElementById('err');
  err.textContent = '';
  const snap = await window.ledger.activate(document.getElementById('key').value);
  if (snap.locked) {
    err.textContent = snap.error || snap.reason || 'Activation failed';
    return;
  }
});

document.getElementById('claim').addEventListener('click', async () => {
  const err = document.getElementById('err');
  err.textContent = '';
  const email = document.getElementById('email').value.trim();
  if (!email || !email.includes('@')) {
    err.textContent = 'Enter the email you paid with.';
    return;
  }
  const snap = await window.ledger.claim(email);
  if (snap.locked) {
    err.textContent = snap.error === 'no_purchase'
      ? 'No paid license for that email yet.'
      : (snap.error || snap.reason || 'Could not claim');
  }
});

document.getElementById('buy-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = document.getElementById('err');
  err.textContent = '';
  const plan = (e.submitter && e.submitter.dataset.plan) || 'personal';
  const email = document.getElementById('email').value.trim();
  if (!email || !email.includes('@')) {
    err.textContent = 'Enter the email for the receipt.';
    return;
  }
  const snap = await window.ledger.buy({ plan, email });
  if (snap.locked) {
    err.textContent = snap.error || snap.reason || 'Checkout failed';
    return;
  }
});

paint();
window.ledger.onLicense((snap) => {
  if (!snap.locked) return;
  document.getElementById('title').textContent = titles[snap.reason] || titles.no_lease;
});
