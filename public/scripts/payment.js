// public/scripts/payment.js


const axios = require('axios');
// Import Axios for making HTTP requests

window.addEventListener('DOMContentLoaded', () => {
  const payButton = document.getElementById('pay');
  const amountInput = document.getElementById('amount');
  const status = document.getElementById('status');
  const loader = document.getElementById('loader');
  const errorDiv = document.getElementById('amount-error');

  // Get dynamic values from data attributes
  const phoneNumber = document.getElementById('payment-form').dataset.phone;
  const accountReference = document.getElementById('payment-form').dataset.token;
  const apiBaseUrl = document.getElementById('payment-form').dataset.apiUrl;

  payButton.onclick = async () => {
    const amount = parseFloat(amountInput.value);
    if (!amount || amount < 1 || amount > 150000) {
      errorDiv.textContent = 'Please enter an amount between KES 1 and KES 150,000';
      status.className = 'error';
      return;
    }

    payButton.disabled = true;
    loader.style.display = 'block';
    status.textContent = 'Sending payment request...';
    console.log('Sending STK Push:', { amount: amount.toFixed(2), phoneNumber, accountReference });

    try {
      const response = await axios.post(`${apiBaseUrl}/api/stkpush`, {
        amount: amount.toFixed(2),
        phoneNumber,
        accountReference,
        transactionDesc: 'Balance payment'
      });
      const data = response.data;
      loader.style.display = 'none';
      status.textContent = 'Payment prompt sent to your phone!';
      alert('Payment prompt sent to your phone. Please check and approve.');
    } catch (error) {
      loader.style.display = 'none';
      status.textContent = `Error: ${error.response?.data?.error || error.message}`;
      status.className = 'error';
      errorDiv.textContent = `Payment request failed: ${error.response?.data?.error || error.message}`;
      console.error('Axios error:', error);
      payButton.disabled = false;
    }
  };
});