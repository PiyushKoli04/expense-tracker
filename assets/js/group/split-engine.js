/* ============================================
   SPLIT ENGINE — split-engine.js
   Split Calculations, Validations and Allocations Helpers
   ============================================ */

const SplitEngine = (() => {

  /**
   * Calculate exact shares of all participants
   * @param {number} totalAmount
   * @param {string} splitType - Equal, Unequal, Percentage, Share-based
   * @param {Array} participants - List of participant uids
   * @param {object} splitDetails - Map of uid to value (amount, percentage, or shares)
   * @returns {object} { success, shares, error }
   */
  function calculateShares(totalAmount, splitType, participants, splitDetails = {}) {
    const amt = parseFloat(totalAmount) || 0;
    if (amt <= 0) {
      return { success: false, error: 'Total amount must be greater than zero.' };
    }
    if (!participants || participants.length === 0) {
      return { success: false, error: 'At least one participant must be selected.' };
    }

    const calculatedShares = {};
    let sum = 0;

    switch (splitType) {
      case 'Equal': {
        const share = amt / participants.length;
        participants.forEach(uid => {
          calculatedShares[uid] = parseFloat(share.toFixed(2));
        });
        
        // Correct tiny decimal rounding discrepancy on the last participant
        adjustRounding(calculatedShares, participants, amt);
        return { success: true, shares: calculatedShares };
      }

      case 'Unequal': {
        // Validate that custom inputs add up exactly to the total amount
        participants.forEach(uid => {
          const val = parseFloat(splitDetails[uid]) || 0;
          calculatedShares[uid] = val;
          sum += val;
        });

        // Let's allow minor rounding difference of up to 1 rupee/unit, otherwise throw error
        const diff = Math.abs(sum - amt);
        if (diff > 0.05) {
          return {
            success: false,
            error: `Total of split amounts (${Utils.formatCurrency(sum)}) must equal the total bill amount (${Utils.formatCurrency(amt)}). Difference: ${Utils.formatCurrency(diff)}`
          };
        }

        return { success: true, shares: calculatedShares };
      }

      case 'Percentage': {
        // Validate that percentages add up to exactly 100%
        participants.forEach(uid => {
          const pct = parseFloat(splitDetails[uid]) || 0;
          sum += pct;
          calculatedShares[uid] = parseFloat(((pct / 100) * amt).toFixed(2));
        });

        if (Math.abs(sum - 100) > 0.01) {
          return {
            success: false,
            error: `Total percentage must equal exactly 100%. Currently it is ${sum.toFixed(1)}%.`
          };
        }

        adjustRounding(calculatedShares, participants, amt);
        return { success: true, shares: calculatedShares };
      }

      case 'Share-based': {
        // Sum total shares
        let totalShares = 0;
        participants.forEach(uid => {
          const shares = parseFloat(splitDetails[uid]) || 0;
          totalShares += shares;
        });

        if (totalShares <= 0) {
          return { success: false, error: 'Sum of shares must be greater than zero.' };
        }

        participants.forEach(uid => {
          const shares = parseFloat(splitDetails[uid]) || 0;
          calculatedShares[uid] = parseFloat(((shares / totalShares) * amt).toFixed(2));
        });

        adjustRounding(calculatedShares, participants, amt);
        return { success: true, shares: calculatedShares };
      }

      default:
        return { success: false, error: 'Unknown split type.' };
    }
  }

  /**
   * Adjust tiny penny differences on division rounding
   */
  function adjustRounding(shares, participants, targetSum) {
    let currentSum = Object.values(shares).reduce((a, b) => a + b, 0);
    let diff = parseFloat((targetSum - currentSum).toFixed(2));
    
    if (diff !== 0 && participants.length > 0) {
      // Add the tiny delta to the first participant
      const firstUid = participants[0];
      shares[firstUid] = parseFloat((shares[firstUid] + diff).toFixed(2));
    }
  }

  return {
    calculateShares
  };
})();
