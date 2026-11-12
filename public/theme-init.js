// Applique le thème avant le premier rendu pour éviter un flash (fichier séparé : la politique de sécurité interdit les scripts en ligne)
try {
  var pref = localStorage.getItem('pecule-theme') || 'dark';
  var t = pref === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : pref;
  document.documentElement.setAttribute('data-theme', t);
} catch (e) {}
