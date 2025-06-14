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
  async function checkPaymentStatus(checkoutRequestId, retries = 30, interval = 2000) {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(`${apiBaseUrl}/api/status/${checkoutRequestId}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        const data = await response.json();
        if (response.ok && data.status === 'completed') {
          status.className = 'status success';
          status.textContent = `Payment Successful, ${firstName}!`;
          payButton.disabled = true;
          cancelButton.disabled = true;
          loader.classList.remove('show');
          // Delay 3 seconds before closing
          setTimeout(() => {
            window.close(); // Try to close the window
            // Fallback redirect if window.close() fails
            window.location.href = `${apiBaseUrl}/api/cancelled`; // Or a success page
          }, 3000);
          return;
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
    const amount = parseFloat(amountInput.value);
    if (!amount || amount < 1 || amount > 150000) {
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
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: amount.toFixed(2),
          phoneNumber,
          accountReference,
          transactionDesc: 'Balance payment for garbage collection',
        }),
      });

      if (!resp.ok) {
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
      status.textContent = 'Payment prompt sent to your phone!';
      alert('Payment prompt sent. Please check and approve on your device.');

      // Start polling for payment status
      await checkPaymentStatus(data.CheckoutRequestID);
    } catch (err) {
      loader.classList.remove('show');
      status.textContent = `Error: ${err.message}`;
      status.className = 'status error';
      errorDiv.textContent = `Payment request failed: ${err.message}`;
      errorDiv.classList.add('show');
      console.error('Payment error:', err);
      payButton.disabled = false;
      cancelButton.disabled = false;
    }
  });

  // Cancel button click handler
  cancelButton.addEventListener('click', () => {
    if (confirm('Are you sure you want to cancel the payment?')) {
      status.className = 'status';
      status.textContent = 'Payment cancelled';
      payButton.disabled = true;
      cancelButton.disabled = true;
      setTimeout(() => {
        window.close(); // Try to close the window
        window.location.href = `${apiBaseUrl}/api/cancelled`; // Fallback
      }, 2000);
    }
  });
});