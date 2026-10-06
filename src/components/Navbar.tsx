import React, { useState, useEffect, useRef } from 'react';
import { AppPage } from '../types';

interface NavbarProps {
  currentLang: 'UA' | 'RU';
  onLangChange: (lang: 'UA' | 'RU') => void;
  currentPage: AppPage;
  onNavigate: (page: AppPage) => void;
}

interface DropdownItem {
  id: string;
  labelUA: string;
  labelRU: string;
  page?: AppPage;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentLang,
  onLangChange,
  currentPage,
  onNavigate
}) => {
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [openFirm, setOpenFirm] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setOpenDropdown(null);
        setOpenFirm(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleMouseEnter = (itemId: string) => {
    const item = navItems.find(n => n.id === itemId);
    if (item && item.hasDropdown) {
      setOpenDropdown(itemId);
    }
  };

  const handleMouseLeave = () => {
    setOpenDropdown(null);
  };

  const handleToggleClick = (e: React.MouseEvent, itemId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const item = navItems.find(n => n.id === itemId);
    if (item && item.hasDropdown) {
      setOpenDropdown(prev => (prev === itemId ? null : itemId));
    }
  };

  // Exact 9 items for "Автообробка" in the specified order
  const autoProcessingItems: DropdownItem[] = [
    {
      id: 'client-settings',
      labelUA: 'Налаштування клієнтів',
      labelRU: 'Настройка клиентов'
    },
    {
      id: 'registry',
      labelUA: 'Блокування автоімпорту',
      labelRU: 'Блокировка автоимпорта',
      page: 'registry'
    },
    {
      id: 'buffer',
      labelUA: 'Замовлення у черзі (буфер)',
      labelRU: 'Заказы в очереди (буфер)',
      page: 'buffer'
    },
    {
      id: 'objects',
      labelUA: "Блокування об'єктів",
      labelRU: 'Блокировка объектов',
      page: 'objects'
    },
    {
      id: 'unlocked-queue',
      labelUA: 'Замовлення у черзі (розблокування)',
      labelRU: 'Заказы в очереди (разблокировка)',
      page: 'unlocked-queue'
    },
    {
      id: 'report-debug',
      labelUA: 'Звіт з налагодження автоімпорту',
      labelRU: 'Отчет по отладке автоимпорта'
    },
    {
      id: 'priorities',
      labelUA: 'Пріоритети обробки',
      labelRU: 'Приоритеты обработки'
    },
    {
      id: 'expiry-limits',
      labelUA: 'Обмеження за термінами придатності',
      labelRU: 'Ограничения по срокам годности'
    },
    {
      id: 'goods-schedule',
      labelUA: 'Розклад змін обмежень для товарів',
      labelRU: 'Расписание изменений ограничений для товаров'
    }
  ];

  // Secondary mock dropdowns for other menu items with dropdowns
  const genericDropdowns: Record<string, DropdownItem[]> = {
    events: [
      { id: 'ev1', labelUA: 'Журнал заходів', labelRU: 'Журнал мероприятий' },
      { id: 'ev2', labelUA: 'Планування заходів', labelRU: 'Планирование мероприятий' }
    ],
    refs: [
      { id: 'ref1', labelUA: 'Довідник клієнтів', labelRU: 'Справочник клиентов' },
      { id: 'ref2', labelUA: 'Довідник товарів', labelRU: 'Справочник товаров' },
      { id: 'ref3', labelUA: 'Довідник складів', labelRU: 'Справочник складов' }
    ],
    clients: [
      { id: 'cl1', labelUA: 'Реєстр клієнтів', labelRU: 'Реестр клиентов' },
      { id: 'cl2', labelUA: 'Договори та угоди', labelRU: 'Договоры и соглашения' }
    ],
    plans: [
      { id: 'pl1', labelUA: 'Плани продажів', labelRU: 'Планы продаж' },
      { id: 'pl2', labelUA: 'Аналіз виконання планів', labelRU: 'Анализ выполнения планов' }
    ],
    reports: [
      { id: 'rep1', labelUA: 'Звіт по продажах', labelRU: 'Отчет по продажам' },
      { id: 'rep2', labelUA: 'Звіт по дебіторській заборгованості', labelRU: 'Отчет по дебиторской задолженности' }
    ],
    admin: [
      { id: 'adm1', labelUA: 'Користувачі системи', labelRU: 'Пользователи системы' },
      { id: 'adm2', labelUA: 'Ролі та права доступу', labelRU: 'Роли и права доступа' }
    ]
  };

  // Exact 14 menu items
  const navItems = [
    { id: 'home', nameUA: 'Головна', nameRU: 'Главная', hasDropdown: false },
    { id: 'events', nameUA: 'Заходи', nameRU: 'Мероприятия', hasDropdown: true },
    { id: 'refs', nameUA: 'Довідники', nameRU: 'Справочники', hasDropdown: true },
    { id: 'clients', nameUA: 'Клієнти', nameRU: 'Клиенты', hasDropdown: true },
    { id: 'plans', nameUA: 'Плани продажів', nameRU: 'Планы продаж', hasDropdown: true },
    {
      id: 'auto_processing',
      nameUA: 'Автообробка',
      nameRU: 'Автообработка',
      hasDropdown: true,
      isAutoProcessing: true
    },
    { id: 'reports', nameUA: 'Звіти', nameRU: 'Отчеты', hasDropdown: true },
    { id: 'admin', nameUA: 'Адміністратор', nameRU: 'Администратор', hasDropdown: true },
    { id: 'contact_center', nameUA: 'Контакт центр', nameRU: 'Контакт центр', hasDropdown: false },
    { id: 'monitoring', nameUA: 'Моніторинг вхідних замовлень', nameRU: 'Мониторинг входящих заказов', hasDropdown: false },
    { id: 'about_crm', nameUA: 'О CRM', nameRU: 'О CRM', hasDropdown: false },
    { id: 'tasks', nameUA: 'Завдання', nameRU: 'Задачи', hasDropdown: false },
    { id: 'mobile_agent', nameUA: 'Мобільный агент', nameRU: 'Мобильный агент', hasDropdown: false },
    { id: 'users_ok', nameUA: 'Користувачі ОК', nameRU: 'Пользователи ОК', hasDropdown: false },
  ];

  // Р2: вікно клієнта відкривається поверх реєстру — пункт меню реєстру лишається активним
  const isAutoProcessingActive = ['registry', 'buffer', 'objects', 'unlocked-queue', 'client'].includes(currentPage);

  return (
    <div ref={navRef} id="app-main-navbar" style={{ width: '100%', position: 'sticky', top: 0, zIndex: 1050 }}>
      {/* 1. Main Top Dark Navbar */}
      <nav
        className="navbar navbar-inverse"
        style={{
          minHeight: '44px',
          marginBottom: 0,
          backgroundColor: '#222222',
          borderBottom: '1px solid #080808',
          borderRadius: 0,
          backgroundImage: 'linear-gradient(to bottom, #3c3c3c 0%, #222222 100%)',
          position: 'relative',
          overflow: 'visible'
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'stretch',
            width: '100%',
            padding: '0 15px',
            position: 'relative',
            overflow: 'visible'
          }}
        >
          {/* Brand CRM Logo */}
          <div style={{ display: 'flex', alignItems: 'center', marginRight: '12px', flexShrink: 0 }}>
            <a
              href="#/auto-processing/client-locks"
              onClick={(e) => {
                e.preventDefault();
                onNavigate('registry');
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: '#2d6898',
                color: '#ffffff',
                fontWeight: 'bold',
                fontSize: '13px',
                textDecoration: 'none',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                border: '1px solid #1e4b6e'
              }}
              title="CRM"
            >
              CRM
            </a>
          </div>

          {/* 14 Navigation Items */}
          <ul
            className="nav navbar-nav"
            style={{
              display: 'flex',
              alignItems: 'stretch',
              listStyle: 'none',
              margin: 0,
              padding: 0,
              height: '44px',
              position: 'relative',
              overflow: 'visible'
            }}
          >
            {navItems.map((item, index) => {
              const displayName = currentLang === 'UA' ? item.nameUA : item.nameRU;
              const isOpen = openDropdown === item.id;
              const isActive = item.isAutoProcessing && isAutoProcessingActive;
              const dropdownList = item.isAutoProcessing ? autoProcessingItems : genericDropdowns[item.id];

              return (
                <React.Fragment key={item.id}>
                  <li
                    className={`dropdown ${isOpen ? 'open' : ''} ${isActive ? 'active' : ''}`}
                    onMouseEnter={() => handleMouseEnter(item.id)}
                    onMouseLeave={handleMouseLeave}
                    style={{
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'stretch',
                      height: '100%',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    <a
                      href="#"
                      onClick={(e) => handleToggleClick(e, item.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        height: '100%',
                        padding: '0 9px',
                        fontSize: '13px',
                        color: isOpen ? '#ffffff' : isActive ? '#ffffff' : '#9d9d9d',
                        backgroundColor: isOpen ? '#000000' : isActive ? '#080808' : 'transparent',
                        textDecoration: 'none',
                        fontWeight: isActive ? 'bold' : 'normal',
                        cursor: 'pointer',
                        transition: 'background-color 0.15s, color 0.15s'
                      }}
                      onMouseEnter={(e) => {
                        if (!isOpen && !isActive) {
                          e.currentTarget.style.color = '#ffffff';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isOpen && !isActive) {
                          e.currentTarget.style.color = '#9d9d9d';
                        }
                      }}
                    >
                      {displayName}
                      {item.hasDropdown && (
                        <b
                          className="caret"
                          style={{
                            marginLeft: '4px',
                            borderTopColor: isOpen || isActive ? '#ffffff' : '#9d9d9d'
                          }}
                        />
                      )}
                    </a>

                    {/* Dropdown Menu */}
                    {item.hasDropdown && dropdownList && (
                      <ul
                        className="dropdown-menu"
                        style={{
                          display: isOpen ? 'block' : 'none',
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          zIndex: 2500,
                          minWidth: item.isAutoProcessing ? '300px' : '220px',
                          padding: '5px 0',
                          margin: 0,
                          backgroundColor: '#ffffff',
                          border: '1px solid rgba(0,0,0,.2)',
                          borderRadius: '0 0 4px 4px',
                          boxShadow: '0 6px 12px rgba(0,0,0,.25)',
                          listStyle: 'none'
                        }}
                      >
                        {dropdownList.map((subItem) => {
                          const subLabel = currentLang === 'UA' ? subItem.labelUA : subItem.labelRU;
                          const isSubActive = subItem.page === currentPage || (subItem.page === 'registry' && currentPage === 'client');

                          return (
                            <li
                              key={subItem.id}
                              style={{
                                backgroundColor: isSubActive ? '#337ab7' : 'transparent'
                              }}
                            >
                              <a
                                href="#"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setOpenDropdown(null);
                                  if (subItem.page) {
                                    onNavigate(subItem.page);
                                  }
                                }}
                                style={{
                                  display: 'block',
                                  padding: '7px 20px',
                                  clear: 'both',
                                  fontWeight: isSubActive ? 'bold' : 'normal',
                                  lineHeight: 1.42857143,
                                  color: isSubActive ? '#ffffff' : '#333333',
                                  whiteSpace: 'nowrap',
                                  textDecoration: 'none',
                                  fontSize: '13px',
                                  cursor: 'pointer'
                                }}
                                onMouseEnter={(e) => {
                                  if (!isSubActive) {
                                    e.currentTarget.style.backgroundColor = '#f5f5f5';
                                    e.currentTarget.style.color = '#262626';
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (!isSubActive) {
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                    e.currentTarget.style.color = '#333333';
                                  }
                                }}
                              >
                                {subLabel}
                              </a>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>

                  {index < navItems.length - 1 && (
                    <li
                      style={{
                        height: '24px',
                        alignSelf: 'center',
                        margin: '0 1px',
                        borderRight: '1px solid #333333',
                        borderLeft: '1px solid #111111',
                        listStyle: 'none'
                      }}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </ul>

          {/* Language Switcher */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', paddingLeft: '15px', flexShrink: 0 }}>
            <div className="btn-group btn-group-xs" role="group">
              <button
                type="button"
                className={`btn ${currentLang === 'UA' ? 'btn-primary' : 'btn-default'}`}
                style={{ fontSize: '11px', padding: '2px 8px', fontWeight: currentLang === 'UA' ? 'bold' : 'normal' }}
                onClick={() => onLangChange('UA')}
              >
                UA
              </button>
              <button
                type="button"
                className={`btn ${currentLang === 'RU' ? 'btn-primary' : 'btn-default'}`}
                style={{ fontSize: '11px', padding: '2px 8px', fontWeight: currentLang === 'RU' ? 'bold' : 'normal' }}
                onClick={() => onLangChange('RU')}
              >
                RU
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* 2. Sub-Header Bar with Firm and Operator */}
      <div
        style={{
          backgroundColor: '#282828',
          borderBottom: '1px solid #1a1a1a',
          padding: '4px 15px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '12px',
          color: '#9d9d9d',
          position: 'relative',
          overflow: 'visible'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpenFirm(!openFirm);
              setOpenDropdown(null);
            }}
            style={{
              color: '#cccccc',
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              cursor: 'pointer'
            }}
          >
            ТОВ "БаДМ"-ТЕСТ5
            <b
              className="caret"
              style={{
                marginLeft: '5px',
                borderTopColor: '#cccccc'
              }}
            />
          </a>

          {openFirm && (
            <ul
              style={{
                display: 'block',
                position: 'absolute',
                top: '100%',
                left: 0,
                zIndex: 2500,
                minWidth: '200px',
                padding: '5px 0',
                margin: '2px 0 0',
                backgroundColor: '#ffffff',
                border: '1px solid rgba(0,0,0,.2)',
                borderRadius: '4px',
                boxShadow: '0 6px 12px rgba(0,0,0,.25)',
                listStyle: 'none'
              }}
            >
              <li style={{ padding: '6px 16px', fontWeight: 'bold', color: '#333333' }}>
                ТОВ "БаДМ"-ТЕСТ5
              </li>
              <li
                style={{ padding: '6px 16px', color: '#666666', cursor: 'pointer' }}
                onClick={() => setOpenFirm(false)}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f5f5f5'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                ТОВ "БаДМ"-ОСНОВНЕ
              </li>
            </ul>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', color: '#9d9d9d' }}>
          <span>Дубінін Микита Валерійович</span>
        </div>
      </div>
    </div>
  );
};
