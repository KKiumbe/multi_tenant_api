window.addEventListener('DOMContentLoaded', () => {
  const payButton = document.getElementById('pay');
  const cancelButton = document.getElementById('cancel');
  const amountInput = document.getElementById('amount');
  const status = document.getElementById('status');
  const loader = document.getElementById('loader');
  const errorDiv = document.getElementById('amount-error');
  const formEl = document.getElementById('payment-form');

  // Read data-attrs from <form id="payment-form" ...>
  const phoneNumber = formEl.dataset.phone;
  const accountReference = formEl.dataset.token;
  const apiBaseUrl = formEl.dataset.apiUrl;
  const firstName = formEl.dataset.firstName || 'Customer';

  // Function to check payment status
  async function checkPaymentStatus(checkoutRequestId, retries = 30, interval = 5000) {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(`${apiBaseUrl}/api/status/${checkoutRequestId}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        const data = await response.json();
        if (response.ok && data.status === 'completed') {
          return true;
        } else if (response.ok && data.status === 'failed') {
          throw new Error(data.error || 'Payment failed');
        }
      } catch (err) {
        console.error('Status check error:', err.message);
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    throw new Error('Payment status check timed out');
  }

  // Form submit handler
  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rawAmt = parseFloat(amountInput.value);
    if (!rawAmt || rawAmt < 1 || rawAmt > 150000) {
      errorDiv.textContent = 'Amount must be between KES 1 and 150,000';
      errorDiv.classList.add('show');
      status.className = 'status error';
      return;
    }
    errorDiv.textContent = '';
    errorDiv.classList.remove('show');

    // UI feedback
    payButton.disabled = true;
    cancelButton.disabled = true;
    loader.classList.add('show');
    status.textContent = 'Sending payment request...';

    try {
      const resp = await fetch(`${apiBaseUrl}/api/stkpush`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amountInput.value,
          phoneNumber,
          accountReference,
          transactionDesc: 'Balance payment for garbage collection',
        }),
      });

      if (!resp.ok) {
        const errJSON = await resp.json().catch(() => null);
        const errMsg = errJSON?.error || (await resp.text());
        throw new Error(errMsg);
      }

      const data = await resp.json();
      status.textContent = 'Payment prompt sent. Please approve on your phone.';

      // Start polling for payment status
      await checkPaymentStatus(data.CheckoutRequestID);

      // On success, show confirmation then close
      status.className = 'status success';
      status.textContent = `Payment successful, ${firstName}!`;
      loader.classList.remove('show');
      setTimeout(() => window.close(), 5000);
    } catch (err) {
      loader.classList.remove('show');
      status.textContent = `Error: ${err.message}`;
      status.className = 'status error';
      errorDiv.textContent = `Payment error: ${err.message}`;
      errorDiv.classList.add('show');
      payButton.disabled = false;
      cancelButton.disabled = false;
      console.error('Payment error:', err);
    }
  });

  // Cancel button click handler simply closes the page
  cancelButton.addEventListener('click', () => {
    window.close();
  });
});