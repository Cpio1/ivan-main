(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
	[974], {
		2300: (e, t, a) => {
			Promise.resolve().then(a.bind(a, 9319))
		},
		2492: (e, t, a) => {
			"use strict";a.d(t, {
				w: () => r
			});
			let s = ["Ivan Ivanov", "Arsen Zholaman", "Valensiya Makridina", "Ali Beisembek", "Meirkhan Kairbekov", "Rustam Yersainov", "Suleiman Maxutov"];

			function r(e, t) {
				if(!e || !t) return !1;
				let a = "".concat(e.trim(), " ").concat(t.trim()).toLowerCase();
				return s.map(e => e.toLowerCase()).includes(a)
			}
		},
		6046: (e, t, a) => {
			"use strict";
			var s = a(6658);a.o(s, "useRouter") && a.d(t, {
				useRouter: function() {
					return s.useRouter
				}
			})
		},
		9319: (e, t, a) => {
			"use strict";a.r(t),
			a.d(t, {
				default: () => u
			});
			var s = a(5155),
				r = a(2115),
				l = a(6046),
				n = a(8173),
				c = a.n(n),
				i = a(2492);

			function u() {
				let [e, t] = (0, r.useState)(""), [a, n] = (0, r.useState)(""), [u, o] = (0, r.useState)(!0), [d, m] = (0, r.useState)(""), h = (0, l.useRouter)(), x = e.trim() && a.trim() && u;
				return(0, s.jsx)("div", {
					className: "min-h-screen bg-[#c9dfd3] flex flex-col items-center justify-center p-4",
					children: (0, s.jsxs)("div", {
						className: "bg-white p-6 rounded-lg shadow-md w-96 text-center",
						children: [(0, s.jsx)("h1", {
							className: "text-3xl mb-4",
							children: "Log in to Bluebook"
						}), (0, s.jsx)("input", {
							type: "text",
							placeholder: "First Name",
							value: e,
							onChange: e => t(e.target.value),
							className: "w-full p-3 border rounded-md mb-3 text-sm"
						}), (0, s.jsx)("input", {
							type: "text",
							placeholder: "Last Name",
							value: a,
							onChange: e => n(e.target.value),
							className: "w-full p-3 border rounded-md text-sm"
						}), (0, s.jsxs)("div", {
							className: "flex items-center mt-3 text-sm text-gray-600",
							children: [(0, s.jsx)("input", {
								type: "checkbox",
								checked: u,
								onChange: () => o(!u),
								className: "w-4 h-4 mr-2"
							}), (0, s.jsxs)("label", {
								children: ["I accept the", " ", (0, s.jsx)(c(), {
									href: "/terms",
									className: "text-blue-500 underline",
									children: "Terms & Privacy Policy"
								})]
							})]
						}), d && (0, s.jsx)("p", {
							className: "mt-3 text-sm text-red-600",
							children: d
						}), (0, s.jsx)("button", {
							onClick: () => {
								if(!(0, i.w)(e, a)) {
									m("This name is not registered. Contact admin.");
									return
								}
								localStorage.setItem("firstName", e),
								localStorage.setItem("lastName", a),
								h.push("/start")
							},
							disabled: !x,
							className: "mt-4 px-4 py-3 text-sm rounded-3xl border-2 border-black/70 w-full ".concat(x ? "bg-yellow-400 text-black" : "bg-[#f0f0f0] text-[#c0c0c0] cursor-not-allowed"),
							children: "Continue"
						}), (0, s.jsx)("p", {
							className: "mt-2 text-xs text-gray-600 italic",
							children: "Powered by College Board 2025"
						})]
					})
				})
			}
		}
	},
	e => {
		var t = t => e(e.s = t);e.O(0, [441, 587, 358], () => t(2300)),
		_N_E = e.O()
	}
]);
