/* ============================================
   PDF EXPORT — pdf-export.js
   jsPDF & html2canvas Wrapper to Export Premium Reports
   ============================================ */

const PDFExport = (() => {

  /**
   * Export an HTML element as a PDF document
   * @param {string} elementId - The ID of the element to export (e.g., 'dashboardContent')
   * @param {string} filename - Output filename (e.g., 'personal-report.pdf')
   */
  async function exportElementToPDF(elementId, filename = 'report.pdf') {
    const element = document.getElementById(elementId);
    if (!element) {
      console.error(`Element with ID "${elementId}" not found.`);
      UI.showToast('Failed to export: element not found.', 'error');
      return;
    }

    // Show loading spinner
    const btn = document.querySelector('[data-pdf-export-btn]');
    if (btn) UI.showButtonSpinner(btn, 'Generating PDF...');

    try {
      // Temporarily add a printing class to styling adjust element for print if needed
      element.classList.add('pdf-rendering');

      // html2canvas configurations for high quality output
      const canvas = await html2canvas(element, {
        scale: 2, // High resolution rendering
        useCORS: true, // Handle cross-origin CDN images
        allowTaint: true,
        backgroundColor: '#0A0E1A', // Dark mode background match
        logging: false
      });

      element.classList.remove('pdf-rendering');

      // Setup jsPDF (A4 dimensions: 210mm x 297mm)
      const imgWidth = 210;
      const pageHeight = 297;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;

      // jsPDF instance: Portrait, millimeters, A4
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF('p', 'mm', 'a4');
      let position = 0;

      const imgData = canvas.toDataURL('image/png');

      // Add image to PDF, spanning multiple pages if height exceeds A4 page height
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight, '', 'FAST');
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight, '', 'FAST');
        heightLeft -= pageHeight;
      }

      pdf.save(filename);
      UI.showToast('PDF downloaded successfully!', 'success');
    } catch (error) {
      console.error('Error generating PDF:', error);
      UI.showToast('Error generating PDF. Please try again.', 'error');
    } finally {
      if (btn) UI.hideButtonSpinner(btn);
    }
  }

  /**
   * Export structured data to a clean styled PDF report
   * @param {string} title - Title of the report
   * @param {Array} headers - Column header text array
   * @param {Array} rows - Row data array (each row is an array of strings/numbers)
   * @param {string} filename - Output filename
   */
  function exportDataReport(title, headers, rows, filename = 'report.pdf') {
    const btn = document.querySelector('[data-pdf-export-btn]');
    if (btn) UI.showButtonSpinner(btn, 'Generating PDF...');

    try {
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF('p', 'mm', 'a4');

      // Premium Styling setup
      pdf.setFillColor(10, 14, 26); // Background color #0A0E1A
      pdf.rect(0, 0, 210, 297, 'F');

      // Header Accents
      pdf.setFillColor(0, 212, 255); // Cyan color
      pdf.rect(15, 15, 180, 2, 'F');

      // Title
      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(22);
      pdf.text(title, 15, 27);

      // Metadata Info
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(156, 163, 175); // Text muted
      const dateStr = `Generated on: ${new Date().toLocaleDateString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
      pdf.text(dateStr, 15, 34);

      // Setup simple table manually
      let startY = 45;
      const cellWidth = 180 / headers.length;
      const rowHeight = 10;

      // Render headers
      pdf.setFillColor(31, 41, 55); // Muted dark header background
      pdf.rect(15, startY, 180, rowHeight, 'F');
      
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.setTextColor(0, 212, 255); // Cyan headings

      headers.forEach((header, index) => {
        pdf.text(header, 15 + index * cellWidth + 4, startY + 6);
      });

      startY += rowHeight;

      // Render rows
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(229, 231, 235); // Light text

      rows.forEach((row, rowIndex) => {
        // Page overflow check
        if (startY > 270) {
          pdf.addPage();
          // Reset page background for new page
          pdf.setFillColor(10, 14, 26);
          pdf.rect(0, 0, 210, 297, 'F');
          startY = 20;
        }

        // Alternating row background colors
        if (rowIndex % 2 === 0) {
          pdf.setFillColor(17, 24, 39);
        } else {
          pdf.setFillColor(10, 14, 26);
        }
        pdf.rect(15, startY, 180, rowHeight, 'F');

        row.forEach((cellValue, cellIndex) => {
          const val = String(cellValue || '');
          pdf.text(val, 15 + cellIndex * cellWidth + 4, startY + 6);
        });

        startY += rowHeight;
      });

      pdf.save(filename);
      UI.showToast('Data report exported successfully!', 'success');
    } catch (error) {
      console.error('Error generating data PDF:', error);
      UI.showToast('Error exporting data report.', 'error');
    } finally {
      if (btn) UI.hideButtonSpinner(btn);
    }
  }

  return {
    exportElementToPDF,
    exportDataReport
  };
})();
