/**
 * Utility: PrintContainer
 * --------------------------------------------
 * Prints a specific DOM container with:
 * - Custom scale (10%–100%)
 * - Preserve existing page CSS
 * - Hide / show elements only during print
 * - Cross-browser print scaling support
 *
 * Author: Anmol Singh
 * GitHub: https://github.com/anmolscripts
 * License: MIT
 */

/**
 * Prints a specific container element.
 *
 * @param {string} id - ID of the container to print
 * @param {number} [scale=100] - Print scale percentage (10–100)
 * @param {string[]} [hideSelectors=[]] - CSS selectors to hide during print
 * @param {string[]} [showSelectors=[]] - CSS selectors to force show during print
 *
 * @example
 * PrintContainer('invoice', 80, ['.btn'], ['.print-only']);
 */

const PrintContainer = (id,scale = 100,hideSelectors = [],showSelectors = []) => {
    // clamp scale
    scale = Math.max(10, Math.min(scale, 100));
    const scaleValue = scale / 100;

    const contents = document.getElementById(id).innerHTML;
    const frame1 = document.createElement('iframe');
    frame1.name = "frame1";
    frame1.style.position = "absolute";
    frame1.style.top = "-10000px";
    document.body.appendChild(frame1);

    const frameDoc = frame1.contentWindow || frame1.contentDocument;
    frameDoc.document.open();
    frameDoc.document.write('<html><head><title>Void Bills</title>');

    // Copy styles
    document.querySelectorAll('style').forEach(style => {
        frameDoc.document.head.appendChild(style.cloneNode(true));
    });

    document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
        frameDoc.document.head.appendChild(link.cloneNode(true));
    });

    frameDoc.document.write('</head><body>');
    frameDoc.document.write(contents);
    frameDoc.document.write('</body></html>');
    frameDoc.document.close();

    // Build selector CSS
    const hideCSS = hideSelectors.length
        ? `${hideSelectors.join(',')} { display: none !important; }`
        : '';

    const showCSS = showSelectors.length
        ? `${showSelectors.join(',')} { display: block !important; visibility: visible !important; }`
        : '';

    // PRINT STYLE
    const printStyle = `
    <style>
      @media print {

        body {
          zoom: ${scaleValue};
          transform-origin: top left;
        }

        @supports not (zoom: 1) {
          body {
            transform: scale(${scaleValue});
            width: ${100 / scaleValue}%;
          }
        }

        ${hideCSS}
        ${showCSS}

        body {
          font-family: "Nunito", sans-serif;
          font-size: 10px;
          color: #000;
        }

        table * {
          font-size: .85rem !important;
        }

        .table-responsive {
          overflow: visible !important;
        }

        @page {
          margin: 10mm;
        }
      }
    </style>`;

    frameDoc.document.head.insertAdjacentHTML('beforeend', printStyle);

    setTimeout(() => {
        frame1.contentWindow.focus();
        frame1.contentWindow.print();
        document.body.removeChild(frame1);
    }, 500);

    return false;
};