import React, { useState } from 'react';

export default function SpendCalc() {
  const [spend, setSpend] = useState(10000);
  const [miss, setMiss] = useState(32);

  const money = (n) => '$' + Math.round(n).toLocaleString();
  const blind = (spend * miss) / 100;
  const reallocated = blind * 0.45;

  return (
    <div className="v3-calc">
      <div className="v3-calc-in">
        <label className="v3-calc-f">
          <span className="v3-calc-l">
            Monthly ad spend
            <b>{money(spend)}</b>
          </span>
          <input
            type="range"
            min="1000"
            max="120000"
            step="1000"
            value={spend}
            onChange={(e) => setSpend(Number(e.target.value))}
          />
        </label>
        <label className="v3-calc-f">
          <span className="v3-calc-l">
            Conversions your ad platforms miss
            <b>{miss}%</b>
          </span>
          <input
            type="range"
            min="5"
            max="70"
            step="1"
            value={miss}
            onChange={(e) => setMiss(Number(e.target.value))}
          />
        </label>
        <p className="v3-calc-note">
          Blocked cookies, iOS restrictions and stripped UTMs are the usual causes. If you don’t know your number, 30–40% is the range most teams land in once they measure it.
        </p>
      </div>
      <div className="v3-calc-out">
        <div className="v3-calc-row">
          <span>Spend optimised on blind data</span>
          <b>{money(blind)}<i>/mo</i></b>
        </div>
        <div className="v3-calc-row hi">
          <span>Reallocatable once revenue is credited</span>
          <b>{money(reallocated)}<i>/mo</i></b>
        </div>
        <div className="v3-calc-row sub">
          <span>Over a year</span>
          <b>{money(reallocated * 12)}</b>
        </div>
        <p className="v3-calc-fine">
          Arithmetic, not a forecast: spend × missed share, then the portion typically sitting behind channels that look flat because their revenue was credited elsewhere. Your budget doesn’t change — where it goes does.
        </p>
      </div>
    </div>
  );
}
