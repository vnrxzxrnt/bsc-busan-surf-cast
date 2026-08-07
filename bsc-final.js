(() => {
  if (!window.BSC) return;

  const shopDetails = {
    '서프홀릭 부산송정본점': '서핑 강습 · 보드와 슈트 대여',
    '서프홀릭 다대포': '서핑 강습 · 장비 대여',
    '송도해양레포츠센터': 'SUP · 카약 등 해양레포츠 프로그램',
    '다대포해양레포츠센터': 'SUP · 서핑 · 카이트보딩 체험'
  };
  const rawMy = window.BSC.my;
  const rawJournal = window.BSC.journal;
  const rawWriteJournal = window.BSC.writeJournal;
  const rawVisit = window.BSC.visit;
  const rawCommunity = window.community;

  function hasMember() {
    try {
      return Boolean(JSON.parse(localStorage.getItem('bsc-member-profile') || 'null'));
    } catch {
      return false;
    }
  }

  function requireLogin() {
    openSheet(
      '로그인이 필요한 기능입니다',
      '<p>AI 맞춤 추천, 커뮤니티, MY 기록장은 회원 프로필을 만든 뒤 사용할 수 있습니다.</p><button class="bsc-cta" type="button" onclick="closeSheet();BSC.openMember()">로그인 화면으로 이동</button>'
    );
  }

  function protect(action) {
    if (!hasMember()) {
      requireLogin();
      return;
    }
    return action();
  }

  window.BSC.requireLogin = requireLogin;
  window.BSC.my = () => protect(rawMy);
  window.BSC.journal = () => protect(rawJournal);
  window.BSC.writeJournal = () => protect(rawWriteJournal);
  window.BSC.visit = () => protect(rawVisit);
  window.community = () => protect(rawCommunity);
  window.BSC.community = window.community;
  window.BSC.rental = name => {
    const detail = shopDetails[name];
    if (!detail) return;
    const beachName = ({
      songjeong: '송정 해수욕장',
      songdo: '송도 해수욕장',
      dadaepo: '다대포 해수욕장'
    })[localStorage.getItem('bsc-selected-beach')] || '부산';
    const url = 'https://map.naver.com/p/search/' + encodeURIComponent(`${name} ${beachName} 부산`);
    openSheet(
      `${name} 대여`,
      `<p>${detail}</p><p>운영 시간과 실제 대여 가능 장비는 방문 전에 업체에 확인해 주세요.</p><a class="bsc-cta" href="${url}" target="_blank" rel="noopener">대여점 문의하기 · 위치 보기</a>`
    );
  };
  window.rental = name => {
    if (name) return window.BSC.rental(name);
    const selected = localStorage.getItem('bsc-selected-beach') || 'songjeong';
    const shops = {
      songjeong: ['서프홀릭 부산송정본점'],
      songdo: ['송도해양레포츠센터'],
      dadaepo: ['서프홀릭 다대포', '다대포해양레포츠센터']
    }[selected] || [];
    if (!shops.length) {
      openSheet('확인된 장비 대여점', '<div class="bsc-rental-empty">현재 온라인에서 확인된 상시 장비 대여점이 없습니다. 가상의 업체는 표시하지 않아요.</div>');
      return;
    }
    openSheet(
      '확인된 장비 대여점',
      shops.map(shop => `<div class="bsc-row"><div><b>${shop}</b><small>${shopDetails[shop]}</small></div><button onclick="BSC.rental('${shop}')">대여 보기</button></div>`).join('')
    );
  };
  window.searchRental = () => window.rental();

  let enhancing = false;
  function enhanceUi() {
    if (enhancing) return;
    enhancing = true;

    document.querySelectorAll('.profile-dot').forEach(button => {
      if (button.textContent !== 'MY') button.textContent = 'MY';
    });

    const beachSelect = document.querySelector('#home .bsc-select');
    const selectedBeachOption = beachSelect?.querySelector('option:checked');
    if (beachSelect && selectedBeachOption?.value && beachSelect.firstElementChild !== selectedBeachOption) {
      beachSelect.insertBefore(selectedBeachOption, beachSelect.firstElementChild);
    }

    const navMy = document.querySelector('.nav button[data-target="profile"]');
    if (navMy && navMy.dataset.bscMy !== '1') {
      navMy.dataset.bscMy = '1';
      navMy.innerHTML = '<b>MY</b>MY';
      navMy.onclick = event => {
        event.preventDefault();
        window.BSC.my();
      };
    }

    const recordBack = document.querySelector('#profile .subhead .back');
    const recordTitle = document.querySelector('#profile .subhead h2')?.textContent || '';
    if (recordBack && /기록장/.test(recordTitle)) {
      recordBack.onclick = () => window.BSC.my();
    }

    const wind = parseFloat(document.getElementById('an-wind')?.textContent || '');
    ['A', 'B', 'C'].forEach((zone, index) => {
      const element = document.getElementById(`zone-${zone}`);
      if (!element || !Number.isFinite(wind) || element.textContent.includes('m/s')) return;
      const wave = parseFloat(element.textContent);
      if (Number.isFinite(wave)) {
        element.textContent = `${wave.toFixed(1)}m · ${Math.max(.1, wind + (index - 1) * .35).toFixed(1)}m/s`;
      }
    });

    document.querySelectorAll('#analysis .bsc-card').forEach(card => {
      const heading = card.querySelector('h3');
      if (heading?.textContent === '해상 분석 구역') {
        const description = card.querySelector('p');
        if (description) {
          description.textContent = '첨부 예시처럼 해안선을 따라 나눈 BSC 분석 구역이며, 육지와 하천은 제외했습니다.';
        }
      }
      if (heading?.textContent === '근처 장비 대여점') {
        heading.textContent = '확인된 장비 대여점';
        const list = card.querySelector('.bsc-list');
        if (list && !list.children.length) {
          list.innerHTML = '<div class="bsc-rental-empty">현재 온라인에서 확인된 상시 장비 대여점이 없습니다. 가상의 업체는 표시하지 않아요.</div>';
        }
        list?.querySelectorAll('.bsc-row').forEach(row => {
          const name = row.querySelector('b')?.textContent || '';
          const small = row.querySelector('small');
          if (small && shopDetails[name]) small.textContent = shopDetails[name];
        });
      }
    });

    enhancing = false;
  }

  new MutationObserver(() => queueMicrotask(enhanceUi)).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
  enhanceUi();
})();
