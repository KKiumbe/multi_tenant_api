// public/scripts/payment.js

window.addEventListener('DOMContentLoaded', () => {
  const payButton     = document.getElementById('pay');
  const amountInput   = document.getElementById('amount');
  const status        = document.getElementById('status');
  const loader        = document.getElementById('loader');
  const errorDiv      = document.getElementById('amount-error');
  const formEl        = document.getElementById('payment-form');

  // Read data-attrs from your <form id="payment-form" ...>
  const phoneNumber      = formEl.dataset.phone;
  const accountReference = formEl.dataset.token;
  const apiBaseUrl       = formEl.dataset.apiUrl;

  payButton.addEventListener('click', async () => {
    const amount = parseFloat(amountInput.value);
    if (!amount || amount < 1 || amount > 150000) {
      errorDiv.textContent = 'Please enter an amount between KES 1 and KES 150,000';
      status.className = 'error';
      return;
    }

    // UI feedback
    payButton.disabled = true;
    loader.style.display = 'block';
    status.textContent = 'Sending payment request...';

    try {
      const resp = await fetch(`${apiBaseUrl}/api/stkpush`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: amount.toFixed(2),
          phoneNumber,
          accountReference:phoneNumber,
          transactionDesc: 'Balance payment'
        })
      });

      if (!resp.ok) {
        // pull out error detail if JSON, otherwise text
        let errMsg;
        try {
          const errJSON = await resp.json();
          errMsg = errJSON.error || JSON.stringify(errJSON);
        } catch {
          errMsg = await resp.text();
        }
        throw new Error(errMsg);
      }

      const data = await resp.json();
      loader.style.display = 'none';
      status.textContent = 'Payment prompt sent to your phone!';
      alert('Payment prompt sent. Please check and approve on your device.');

    } catch (err) {
      loader.style.display = 'none';
      status.textContent = `Error: ${err.message}`;
      status.className = 'error';
      errorDiv.textContent = `Payment request failed: ${err.message}`;
      console.error('Payment error:', err);
      payButton.disabled = false;
    }
  });
});
