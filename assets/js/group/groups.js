/* ============================================
   GROUPS — groups.js
   Group Memberships, Creation & Joint Invites
   ============================================ */

const GroupsModule = (() => {

  let _user = null;
  let _profile = null;
  let _rawData = [];

  /**
   * Module initialization hook
   */
  async function init(user, profile) {
    _user = user;
    _profile = profile;

    console.log('👥 Initializing Groups Module...');

    // 1. Dropdown lists setup
    populateDropdowns();

    // 2. Fetch and render memberships
    await fetchAndRenderGroups();
  }

  function populateDropdowns() {
    const select = document.getElementById('groupType');
    if (!select) return;

    select.innerHTML = '<option value="" disabled selected>Choose purpose</option>';
    Utils.groupTypes.forEach(type => {
      const opt = document.createElement('option');
      opt.value = type;
      opt.textContent = type;
      select.appendChild(opt);
    });
  }

  /**
   * Fetch groups where user.uid is inside the members array
   */
  async function fetchAndRenderGroups() {
    try {
      UI.showLoading('#groupsContainer');

      // Fetch groups where active user is inside members list
      _rawData = await FirestoreService.getDocuments('groups', [
        ['members', 'array-contains', _user.uid]
      ]);

      // Fetch settlements to compute pending balances (mocked or aggregated from settlements collection)
      const settlements = await FirestoreService.getDocuments('groupSettlements', [
        ['payer', '==', _user.uid],
        ['status', '==', 'Pending']
      ]);
      const totalOwed = settlements.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);

      UI.hideLoading('#groupsContainer');

      // Update Aggregations counters
      renderOverviewStats(_rawData, totalOwed);

      // Render actual list cards
      renderGroupsList(_rawData);

    } catch (error) {
      console.error('Error fetching groups:', error);
      UI.showToast('Error loading groups details.', 'error');
    }
  }

  function renderOverviewStats(groups, totalOwed) {
    const groupsCount = groups.length;

    // Find favorite group type
    const typeCounts = {};
    groups.forEach(g => {
      typeCounts[g.type] = (typeCounts[g.type] || 0) + 1;
    });

    let favType = '—';
    let max = 0;
    for (const [type, count] of Object.entries(typeCounts)) {
      if (count > max) {
        max = count;
        favType = `${Utils.getGroupTypeIcon(type)} ${type}`;
      }
    }

    Animations.animateCounter('groupsCountVal', groupsCount, { isCurrency: false });
    Animations.animateCounter('groupOwedVal', totalOwed);
    
    const favTypeEl = document.getElementById('favTypeVal');
    if (favTypeEl) favTypeEl.innerHTML = favType;
  }

  /**
   * Render shared networks cards in grid
   */
  function renderGroupsList(groups) {
    const container = document.getElementById('groupsContainer');
    if (!container) return;

    if (groups.length === 0) {
      container.innerHTML = `
        <div class="card col-span-full" style="text-align:center; padding:64px 0; color:var(--text-muted);">
          <div style="font-size:3rem; margin-bottom:12px;">👥</div>
          <h3 style="font-size:var(--fs-lg); font-weight:600; margin-bottom:4px;">No Shared Networks Found</h3>
          <p style="font-size:var(--fs-sm); max-width:340px; margin:0 auto 16px auto;">
            Create a group for trips, apartments, or bills splitting and invite your partners!
          </p>
          <div style="display:flex; gap:12px; justify-content:center;">
            <button class="btn btn-secondary btn-sm" onclick="GroupsModule.openJoinGroupModal()">Join with Code</button>
            <button class="btn btn-primary btn-sm" onclick="GroupsModule.openCreateGroupModal()">Create Group</button>
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = '';
    groups.forEach(group => {
      const details = group.memberDetails || [];
      const memberNames = details.map(m => m.username || 'User').join(', ');
      const icon = Utils.getGroupTypeIcon(group.type);

      const card = document.createElement('div');
      card.className = 'card card--glow-purple';
      card.style.display = 'flex';
      card.style.flexDirection = 'column';
      card.style.justifyContent = 'space-between';
      card.style.minHeight = '200px';

      card.innerHTML = `
        <div>
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:24px;">${icon}</span>
              <div>
                <h3 style="font-size: var(--fs-md); font-weight:700; margin:0;">${group.name}</h3>
                <span class="badge badge--purple" style="font-size:9px; padding:1px 6px;">${group.type}</span>
              </div>
            </div>
            
            <span style="font-size:10px; color:var(--text-muted); cursor:pointer;" onclick="GroupsModule.copyInviteCode('${group.inviteCode}')" title="Copy Invite Code">
              🔑 ${group.inviteCode}
            </span>
          </div>

          <p style="font-size:var(--fs-xs); color:var(--text-muted); margin-bottom:16px; line-height:1.4;">
            <strong>Partners:</strong> ${Utils.truncate(memberNames, 70)}
          </p>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:10px; color:var(--text-muted);">
            Created ${Utils.formatDate(group.createdAt, 'short')}
          </span>
          
          <button class="btn btn-primary btn-sm" style="padding:6px 12px; font-size:11px;" onclick="GroupsModule.enterGroupDashboard('${group.id}')">
            🏰 Enter Hub
          </button>
        </div>
      `;

      container.appendChild(card);
    });

    // Re-initialize Lucide icons for groups list cards
    if (typeof UI !== 'undefined' && UI.reinitIcons) {
      UI.reinitIcons();
    }
  }

  /**
   * Modal actions
   */
  function openCreateGroupModal() {
    document.getElementById('createGroupForm').reset();
    UI.openModal('createGroupModal');
  }

  function openJoinGroupModal() {
    document.getElementById('joinGroupForm').reset();
    UI.openModal('joinGroupModal');
  }

  /**
   * Create shared group document
   */
  async function createGroup() {
    const name = document.getElementById('groupName').value.trim();
    const type = document.getElementById('groupType').value;

    if (!name || !type) {
      UI.showToast('Please fill in required fields.', 'warning');
      return;
    }

    const saveBtn = document.getElementById('saveGroupBtn');
    UI.showButtonSpinner(saveBtn, 'Creating Group...');

    const code = FirestoreService.generateInviteCode();

    const payload = {
      name,
      type,
      createdBy: _user.uid,
      members: [_user.uid],
      memberDetails: [{
        uid: _user.uid,
        username: _profile.username || 'Creator',
        email: _user.email
      }],
      inviteCode: code
    };

    const result = await FirestoreService.addDocument('groups', payload);

    UI.hideButtonSpinner(saveBtn);

    if (result.success) {
      UI.showToast('Group created successfully!', 'success');
      UI.closeModal('createGroupModal');
      await fetchAndRenderGroups();
    } else {
      UI.showToast(`Error creating group: ${result.error}`, 'error');
    }
  }

  /**
   * Join an existing group using invite code
   */
  async function joinGroup() {
    const code = document.getElementById('inviteCode').value.trim().toUpperCase();

    if (!code || code.length !== 8) {
      UI.showToast('Please enter an 8-character invite code.', 'warning');
      return;
    }

    const joinBtn = document.getElementById('joinGroupBtn');
    UI.showButtonSpinner(joinBtn, 'Joining Group...');

    try {
      // Find group document matching code
      const matchingGroups = await FirestoreService.getDocuments('groups', [
        ['inviteCode', '==', code]
      ]);

      if (matchingGroups.length === 0) {
        UI.hideButtonSpinner(joinBtn);
        UI.showToast('Invalid invite code. Group not found.', 'error');
        return;
      }

      const group = matchingGroups[0];
      const members = group.members || [];
      const details = group.memberDetails || [];

      // Check if user is already inside members
      if (members.includes(_user.uid)) {
        UI.hideButtonSpinner(joinBtn);
        UI.showToast('You are already a member of this group!', 'info');
        UI.closeModal('joinGroupModal');
        return;
      }

      // Add user to memberships
      members.push(_user.uid);
      details.push({
        uid: _user.uid,
        username: _profile.username || 'User',
        email: _user.email
      });

      const result = await FirestoreService.updateDocument('groups', group.id, {
        members,
        memberDetails: details
      });

      UI.hideButtonSpinner(joinBtn);

      if (result.success) {
        UI.showToast(`Successfully joined "${group.name}"!`, 'success');
        UI.closeModal('joinGroupModal');
        await fetchAndRenderGroups();
      } else {
        UI.showToast(`Error joining: ${result.error}`, 'error');
      }

    } catch (error) {
      console.error('Error joining group:', error);
      UI.hideButtonSpinner(joinBtn);
      UI.showToast('Error joining group.', 'error');
    }
  }

  function copyInviteCode(code) {
    navigator.clipboard.writeText(code).then(() => {
      UI.showToast(`Invite code ${code} copied to clipboard!`, 'success');
    }).catch(err => {
      console.error('Copy failed:', err);
    });
  }

  function enterGroupDashboard(groupId) {
    // Save selected group ID in session storage to use inside Group Dashboard
    sessionStorage.setItem('currentGroupId', groupId);
    window.location.href = '/group-dashboard.html';
  }

  return {
    init,
    openCreateGroupModal,
    openJoinGroupModal,
    createGroup,
    joinGroup,
    copyInviteCode,
    enterGroupDashboard
  };
})();
