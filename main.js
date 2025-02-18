document.addEventListener('DOMContentLoaded', () => {
  loadConfiguration();
  document.getElementById('customerId').focus();

  const configIcon = document.getElementById('configIcon');
  const configModal = document.getElementById('configModal');
  const closeConfig = document.getElementById('closeConfig');

  configIcon.addEventListener('click', () => {
    configModal.classList.add('active');
    document.body.classList.add('modal-open');
  });
  closeConfig.addEventListener('click', () => {
    configModal.classList.remove('active');
    document.body.classList.remove('modal-open');
  });

  document.getElementById('saveConfig').addEventListener('click', () => {
    const config = {
      dockBaseUrl: document.getElementById('dockBaseUrl').value,
      secret: document.getElementById('secret').value
    };
    chrome.storage.sync.set(config, () => {
      configModal.classList.remove('active');
      document.body.classList.remove('modal-open');
      loadConfiguration();
    });
  });

  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');

  tabContents.forEach((content) => {
    if (content.classList.contains('active')) {
      content.style.display = 'block';
    } else {
      content.style.display = 'none';
    }
  });

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabContents.forEach(content => {
        content.classList.remove('active');
        content.style.display = 'none';
      });
      button.classList.add('active');
      const tabId = button.getAttribute('data-tab');
      const activeContent = document.getElementById(tabId);
      activeContent.classList.add('active');
      activeContent.style.display = 'block';
    });
  });

  document.querySelectorAll('.fetch-button').forEach(button => {
    button.addEventListener('click', async (e) => {
      const tabContent = e.target.closest('.tab-content');
      const resultDiv = tabContent.querySelector('.result');
      const customerId = document.getElementById('customerId').value;
      if (!customerId) {
        alert('Please enter an Account ID.');
        return;
      }

      try {
        const config = await chrome.storage.sync.get(['dockBaseUrl', 'secret']);
        if (!config.dockBaseUrl || !config.secret) {
          alert('Please configure the extension first.');
          return;
        }

        resultDiv.textContent = 'Loading...';

        if (tabContent.id === 'customer-tab') {
          const routeDisplay = tabContent.querySelector('.route-display');
          routeDisplay.textContent = `GET /v2/api/contas/${customerId}`;

          try {
            const data = await makeApiRequest(
              `${config.dockBaseUrl}/v2/api/contas/${customerId}`,
              config
            );
            resultDiv.textContent = '';

            // Define properties to emphasize
            const emphasizedProps = [
              'id',
              'nome',
              'statusConta',
              'dataStatusConta',
              'diasAtraso',
              'diaVencimento',
              'dataUltimaAlteracaoVencimento',
              'limiteGlobal',
              'saldoDisponivelGlobal'
            ];

            // Create and append container for important customer details
            const emphasisContainer = document.createElement('div');
            emphasisContainer.className = 'customer-emphasis';
            let emphasisHTML = '<h3>Customer Details</h3>';
            emphasizedProps.forEach(prop => {
              if (data.hasOwnProperty(prop)) {
                emphasisHTML += `<p><span class="key">${formatKey(prop)}</span>: ${data[prop]}</p>`;
              }
            });
            emphasisContainer.innerHTML = emphasisHTML;
            resultDiv.appendChild(emphasisContainer);

            // Create and append container for all other customer properties
            const otherInfoContainer = document.createElement('div');
            otherInfoContainer.className = 'customer-other-info';
            let otherHTML = '<h3>Other Customer Details</h3>';
            Object.entries(data).forEach(([key, value]) => {
              if (!emphasizedProps.includes(key)) {
                otherHTML += `<p><span class="key">${formatKey(key)}</span>: ${value}</p>`;
              }
            });
            otherInfoContainer.innerHTML = otherHTML;
            resultDiv.appendChild(otherInfoContainer);

          } catch (error) {
            resultDiv.textContent = `Error: ${error.message}`;
          }
        } else if (tabContent.id === 'invoice-tab') {
          const routeDisplay = tabContent.querySelector('.route-display');
          routeDisplay.textContent = `GET /v2/api/faturas?idConta=${customerId}&situacaoProcessamento=TODAS`;

          try {
            const data = await makeApiRequest(
              `${config.dockBaseUrl}/v2/api/faturas?idConta=${customerId}&situacaoProcessamento=TODAS`,
              config
            );

            resultDiv.textContent = '';
            let invoices = [];
            if (data && typeof data === 'object' && Array.isArray(data.content)) {
              invoices = data.content;
            } else if (Array.isArray(data)) {
              invoices = data;
            }

            invoices.sort((a, b) => new Date(b.dataVencimentoFatura) - new Date(a.dataVencimentoFatura));

            let table = resultDiv.querySelector('.invoices-table');
            if (!table) {
              table = document.createElement('table');
              table.className = 'invoices-table';
              const thead = document.createElement('thead');
              thead.innerHTML = `
                <tr>
                  <th>Status</th>
                  <th>Closing Date</th>
                  <th>Due Date</th>
                  <th>Real Due Date</th>
                  <th>Total Value</th>
                  <th>Min Payment</th>
                  <th>Details</th>
                </tr>
              `;
              table.appendChild(thead);
              const tbody = document.createElement('tbody');
              table.appendChild(tbody);
            }
            const tbody = table.querySelector('tbody');
            tbody.innerHTML = '';

            invoices.forEach(invoice => {
              const row = document.createElement('tr');
              const statusClass = invoice.situacaoProcessamento === 'FECHADA' ? 'status-fechada' : 'status-aberta';
              
              row.innerHTML = `
                <td class="${statusClass}">${invoice.situacaoProcessamento}</td>
                <td>${formatDate(invoice.dataFechamento)}</td>
                <td>${formatDate(invoice.dataVencimentoFatura)}</td>
                <td>${formatDate(invoice.dataVencimentoReal)}</td>
                <td>${formatValue(invoice.valorTotal)}</td>
                <td>${invoice.valorPagamentoMinimo === null ? 'Pending' : formatValue(invoice.valorPagamentoMinimo)}</td>
                <td>
                  <button type="button" class="details-button" data-dvf="${invoice.dataVencimentoFatura}">View Transactions</button>
                </td>
              `;

              tbody.appendChild(row);

              const detailsButton = row.querySelector('.details-button');
              detailsButton.addEventListener('click', async (event) => {
                // Save current invoice info for later use
                window.currentInvoiceInfo = {
                  status: invoice.situacaoProcessamento,
                  dueDate: invoice.dataVencimentoFatura,
                  realDueDate: invoice.dataVencimentoReal,
                  closingDate: invoice.dataFechamento,
                  totalValue: invoice.valorTotal,
                  minPayment: invoice.valorPagamentoMinimo
                };

                const invoiceDueDate = event.target.dataset.dvf;
                const accountId = customerId;
                updateRouteDisplay(invoiceDueDate);

                // Update the Transactions (Invoice Details) modal with the invoice data header.
                const invoiceDetailsContent = detailsModal.querySelector('.invoice-details-content');
                let invoiceHeader = invoiceDetailsContent.querySelector('.invoice-header');
                if (!invoiceHeader) {
                  invoiceHeader = document.createElement('div');
                  invoiceHeader.className = 'invoice-header';
                  invoiceHeader.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;';
                  const routeDisplayElement = invoiceDetailsContent.querySelector('.route-display');
                  invoiceDetailsContent.insertBefore(invoiceHeader, routeDisplayElement);
                }
                invoiceHeader.innerHTML = `
                  <div class="invoice-info">
                    <strong>Invoice Information:</strong>
                    Status: ${window.currentInvoiceInfo.status},
                    Due Date: ${formatDate(window.currentInvoiceInfo.dueDate)},
                    Real Due Date: ${formatDate(window.currentInvoiceInfo.realDueDate)},
                    Closing Date: ${formatDate(window.currentInvoiceInfo.closingDate)},
                    Total: ${formatValue(window.currentInvoiceInfo.totalValue)},
                    Min Payment: ${formatValue(window.currentInvoiceInfo.minPayment)}
                  </div>
                  <span class="close-details" id="closeDetails">&times;</span>
                `;
                
                // Attach close event to the header's close button.
                const closeDetailsButton = invoiceDetailsContent.querySelector('#closeDetails');
                if (closeDetailsButton) {
                  closeDetailsButton.addEventListener('click', () => {
                    detailsModal.classList.remove('active');
                    document.body.classList.remove('modal-open');
                  });
                }
                
                // Now fetch and display the transactions in the table of the details modal...
                // (Rest of your details fetch logic goes here.)

                try {
                  const detailData = await makeApiRequest(
                    `${config.dockBaseUrl}/v2/api/faturas/${invoiceDueDate}?idConta=${accountId}`,
                    config
                  );

                  const transactionsTableBody = detailsModal.querySelector('.transactions-table tbody');
                  if (!transactionsTableBody) {
                    console.error("Transactions table body not found in details modal.");
                    return;
                  }

                  transactionsTableBody.innerHTML = '';
                  if (
                    detailData.lancamentosFaturaResponse &&
                    Array.isArray(detailData.lancamentosFaturaResponse)
                  ) {
                    detailData.lancamentosFaturaResponse.forEach(transaction => {
                      const tr = document.createElement('tr');
                      const numeroParcela = transaction.numeroParcela;
                      const quantidadeParcelas = transaction.quantidadeParcelas;

                      const parcelaDisplay = (numeroParcela !== null && numeroParcela > 0) ? `${numeroParcela}/${quantidadeParcelas}` : '';

                      tr.innerHTML = `
                        <td>${transaction.idEvento}</td>
                        <td>${formatDate(transaction.dataHoraTransacao)}</td>
                        <td>${transaction.descricaoTipoTransacao}</td>
                        <td>${transaction.nomeEstabelecimento}</td>
                        <td>${formatValue(transaction.valorBRL)}</td>
                        <td>${parcelaDisplay}</td>
                      `;

                      const actionCell = document.createElement('td');
                      if (numeroParcela !== null && numeroParcela > 0) {
                        const simulateButton = document.createElement('button');
                        simulateButton.textContent = 'Simulate Anticipation';
                        simulateButton.className = 'simulate-button';
                        simulateButton.addEventListener('click', async () => {
                          const accountId = customerId;
                          const idEvento = transaction.idEvento;
                          const simulationRoute = `${config.dockBaseUrl}/v2/api/compras-antecipaveis/${idEvento}/simular-antecipacao?idConta=${customerId}&juros=2`;
                          try {
                            const response = await makeApiRequest(simulationRoute, config);
                            openSimulationModal(response, window.currentInvoiceInfo, simulationRoute);
                          } catch (error) {
                            alert(`Error fetching anticipation simulation: ${error.message}`);
                          }
                        });
                        actionCell.appendChild(simulateButton);
                      } else {
                        actionCell.textContent = '';
                      }
                      tr.appendChild(actionCell);

                      transactionsTableBody.appendChild(tr);
                    });
                  }

                  detailsModal.classList.add('active');
                } catch (error) {
                  alert(`Error fetching invoice details: ${error.message}`);
                }
              });
            });

            table.style.display = 'table';
            resultDiv.appendChild(table);
          } catch (error) {
            resultDiv.textContent = `Error: ${error.message}`;
          }
        } else if (tabContent.id === 'transactions-tab') {
          await fetchNotProcessedTransactions(customerId, config, tabContent, resultDiv);
        } else if (tabContent.id === 'eventos-tab') {
          await fetchEventosExternosCompras(customerId, config, tabContent, resultDiv);
        }
      } catch (error) {
        resultDiv.textContent = `Error: ${error.message}`;
      }
    });
  });

  const detailsModal = document.getElementById('invoiceDetailsModal');
  const closeDetails = document.getElementById('closeDetails');

  if (!detailsModal) {
    console.error("Invoice Details Modal not found in DOM.");
  }
  if (closeDetails) {
    closeDetails.addEventListener('click', () => {
      detailsModal.classList.remove('active');
      document.body.classList.remove('modal-open');
    });
  } else {
    console.error("Close Details button not found.");
  }
  if (detailsModal) {
    detailsModal.addEventListener('click', (e) => {
      if (e.target.classList.contains('close-details') || e.target === detailsModal) {
        detailsModal.classList.remove('active');
        document.body.classList.remove('modal-open');
      }
    });
  }

  function updateRouteDisplay(invoiceId) {
    const customerId = document.getElementById('customerId').value;
    const routeDisplay = detailsModal.querySelector('.route-display');
    routeDisplay.textContent = `GET /v2/api/faturas/${invoiceId}?idConta=${customerId}`;
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && detailsModal && detailsModal.classList.contains('active')) {
      detailsModal.classList.remove('active');
    }
  });

  const simulationModal = document.getElementById('simulationModal');
  const closeSimulation = document.getElementById('closeSimulation');
  if (closeSimulation) {
    closeSimulation.addEventListener('click', () => {
      simulationModal.classList.remove('active');
      document.body.classList.remove('modal-open');
    });
  }
  if (simulationModal) {
    simulationModal.addEventListener('click', (e) => {
      if (e.target === simulationModal) {
        simulationModal.classList.remove('active');
        document.body.classList.remove('modal-open');
      }
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && simulationModal && simulationModal.classList.contains('active')) {
      simulationModal.classList.remove('active');
    }
  });
});

function loadConfiguration() {
  chrome.storage.sync.get(['dockBaseUrl', 'secret'], (result) => {
    document.getElementById('dockBaseUrl').value = result.dockBaseUrl || '';
    document.getElementById('secret').value = result.secret || '';
    const baseUrlDisplay = document.getElementById('currentBaseUrl');
    baseUrlDisplay.textContent = result.dockBaseUrl || 'Not configured';
  });
}

function formatKey(key) {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

function formatValue(value) {
  if (typeof value === "number") {
    return `R$ ${value.toFixed(2)}`;
  }
  return value;
}

function formatDate(dateString) {
  const date = new Date(dateString); // Parse the date string directly
  return date.toLocaleString('pt-BR', { timeZone: 'UTC' }).replace(',', ''); // Format to Brazilian date and time without comma
}

async function makeApiRequest(url, config) {
  try {
    const response = await fetch(url, {
      headers: {
        'access_token': config.secret,
        'Accept': '*/*'
      }
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    throw error;
  }
}

function openSimulationModal(data, ignoreInvoiceInfo, simulationRoute) {
  const simulationModal = document.getElementById('simulationModal');
  const simulationContent = simulationModal.querySelector('.simulation-content');

  // Ensure simulationRoute is a string.
  let routeStr = typeof simulationRoute === 'string' ? simulationRoute : JSON.stringify(simulationRoute);

  // Try to extract only the path and query parameters.
  try {
    // Use window.location.origin as fallback if simulationRoute is relative.
    const parsedUrl = new URL(routeStr, window.location.origin);
    routeStr = parsedUrl.pathname + parsedUrl.search;
  } catch (error) {
    // If simulationRoute is not a valid URL, keep it unchanged.
  }

  simulationContent.innerHTML = `
    <div class="simulation-header" style="display: flex; justify-content: flex-end; align-items: center; margin-bottom: 10px;">
      <span class="close-simulation" id="closeSimulation" style="cursor: pointer; font-size: 24px;">&times;</span>
    </div>
    <div class="route-display" style="margin-bottom: 10px;">
      GET ${routeStr}
    </div>
    <table class="simulation-table" style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr>
          <th>Number of Installments</th>
          <th>Installment Value</th>
          <th>Discount Value</th>
          <th>Discounted Installment Value</th>
          <th>Interest Rebate</th>
        </tr>
      </thead>
      <tbody></tbody>
    </table>
  `;

  const tbody = simulationContent.querySelector('.simulation-table tbody');
  data.detalhes.forEach(detail => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${detail.quantidadeParcelas}</td>
      <td>R$ ${detail.valorParcelas.toFixed(2)}</td>
      <td>R$ ${detail.valorDesconto.toFixed(2)}</td>
      <td>R$ ${detail.valorParcelasDesconto.toFixed(2)}</td>
      <td>R$ ${detail.valorAbatimentoJuros.toFixed(2)}</td>
    `;
    tbody.appendChild(tr);
  });

  simulationModal.classList.add('active');
  document.body.classList.add('modal-open');

  const closeSimulationElement = simulationContent.querySelector('#closeSimulation');
  if (closeSimulationElement) {
    closeSimulationElement.addEventListener('click', () => {
      simulationModal.classList.remove('active');
      document.body.classList.remove('modal-open');
    });
  }
}

async function fetchNotProcessedTransactions(customerId, config, tabContent, resultDiv) {
  const routeDisplay = tabContent.querySelector('.route-display');
  routeDisplay.textContent = `GET /v2/api/contas/${customerId}/transacoes/listar-nao-processadas`;
  
  try {
    const data = await makeApiRequest(`${config.dockBaseUrl}/v2/api/contas/${customerId}/transacoes/listar-nao-processadas`, config);
    resultDiv.textContent = '';

    // Create the table element
    const table = document.createElement('table');
    table.className = 'transactions-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th>idTipoTransacaoNaoProcessada</th>
          <th>identificadorExterno</th>
          <th>valorBRL</th>
          <th>D/C</th>
          <th>descricaoTipoTransacaoNaoProcessada</th>
          <th>descricaoAbreviada</th>
          <th>dataOrigem</th>
          <th>idTipoTransacao</th>
          <th>idTransacao</th>
          <th>idTipoAjuste</th>
          <th>idEventoAjuste</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    
    const tbody = table.querySelector('tbody');
    data.content.forEach(item => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${item.idTipoTransacaoNaoProcessada}</td>
        <td>${item.identificadorExterno}</td>
        <td>${item.valorBRL}</td>
        <td>${item.flagCredito === 0 ? 'D' : 'C'}</td>
        <td>${item.descricaoTipoTransacaoNaoProcessada}</td>
        <td>${item.descricaoAbreviada}</td>
        <td>${item.dataOrigem}</td>
        <td>${item.idTipoTransacao}</td>
        <td>${item.idTransacao}</td>
        <td>${item.idTipoAjuste}</td>
        <td>${item.idEventoAjuste}</td>
      `;
      tbody.appendChild(row);
    });
    resultDiv.appendChild(table);
  } catch (error) {
    resultDiv.textContent = `Error: ${error.message}`;
  }
}

async function fetchEventosExternosCompras(customerId, config, tabContent, resultDiv) {
  // Calculate end-of-day for the current day
  const now = new Date();
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const dataCompraFinal = endOfDay.toISOString();

  // Calculate the date 29 days before today (start of that day)
  const pastDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29, 0, 0, 0, 0);
  const dataCompraInicial = pastDate.toISOString();
  
  const routeDisplay = tabContent.querySelector('.route-display');
  routeDisplay.textContent = `GET /v2/api/eventos-externos-compras?dataCompraFinal=${dataCompraFinal}&dataCompraInicial=${dataCompraInicial}&idConta=${customerId}`;
  
  try {
    const url = `${config.dockBaseUrl}/v2/api/eventos-externos-compras?dataCompraFinal=${encodeURIComponent(dataCompraFinal)}&dataCompraInicial=${encodeURIComponent(dataCompraInicial)}&idConta=${customerId}`;
    const data = await makeApiRequest(url, config);
    resultDiv.textContent = '';
    
    // Create the table element
    const table = document.createElement('table');
    table.className = 'eventos-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th>id</th>
          <th>mcc</th>
          <th>idEstabelecimento</th>
          <th>idConta</th>
          <th>idCartao</th>
          <th>numeroParcelas</th>
          <th>valorParcela</th>
          <th>valorEntrada</th>
          <th>valorCompra</th>
          <th>valorContrato</th>
          <th>valorEncargosTotais</th>
          <th>dataCompra</th>
          <th>idOperacao</th>
          <th>taxaJuros</th>
          <th>valorTAC</th>
          <th>origem</th>
          <th>dataEntradaCompra</th>
          <th>nomeEstabelecimentoVISA</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    
    const tbody = table.querySelector('tbody');
    data.content.forEach(item => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${item.id}</td>
        <td>${item.mcc}</td>
        <td>${item.idEstabelecimento}</td>
        <td>${item.idConta}</td>
        <td>${item.idCartao}</td>
        <td>${item.numeroParcelas}</td>
        <td>${item.valorParcela}</td>
        <td>${item.valorEntrada}</td>
        <td>${item.valorCompra}</td>
        <td>${item.valorContrato}</td>
        <td>${item.valorEncargosTotais}</td>
        <td>${item.dataCompra}</td>
        <td>${item.idOperacao}</td>
        <td>${item.taxaJuros}</td>
        <td>${item.valorTAC}</td>
        <td>${item.origem}</td>
        <td>${item.dataEntradaCompra}</td>
        <td>${item.nomeEstabelecimentoVISA}</td>
      `;
      tbody.appendChild(row);
    });
    resultDiv.appendChild(table);
  } catch (error) {
    resultDiv.textContent = `Error: ${error.message}`;
  }
}

function setupConfigModal() {
  const configModal = document.getElementById('configModal');
  document.getElementById('configIcon').addEventListener('click', () => openModal(configModal));
  document.getElementById('closeConfig').addEventListener('click', () => closeModal(configModal));
  
  document.getElementById('saveConfig').addEventListener('click', saveConfiguration);
}

