"""Suavizado One Euro de posiciones (AGENTS.md §6)."""

from __future__ import annotations

import math
from typing import Mapping, Sequence

import numpy as np


class OneEuroFilter:
    """Filtro One Euro de una dimensión, independiente de la tasa de frames."""

    def __init__(
        self,
        min_cutoff: float = 1.0,
        beta: float = 0.05,
        d_cutoff: float = 1.0,
    ) -> None:
        self.min_cutoff = min_cutoff
        self.beta = beta
        self.d_cutoff = d_cutoff
        self._x: float | None = None
        self._dx = 0.0
        self._t: float | None = None

    @staticmethod
    def _alpha(cutoff: float, dt: float) -> float:
        tau = 1.0 / (2.0 * math.pi * cutoff)
        return 1.0 / (1.0 + tau / dt)

    def reset(self) -> None:
        self._x = None
        self._dx = 0.0
        self._t = None

    def filter(self, value: float, timestamp: float) -> float:
        if self._x is None or self._t is None:
            self._x = value
            self._t = timestamp
            return value

        dt = timestamp - self._t
        if dt <= 0:
            return self._x

        dx = (value - self._x) / dt
        a_d = self._alpha(self.d_cutoff, dt)
        self._dx = a_d * dx + (1.0 - a_d) * self._dx

        cutoff = self.min_cutoff + self.beta * abs(self._dx)
        a = self._alpha(cutoff, dt)
        self._x = a * value + (1.0 - a) * self._x
        self._t = timestamp
        return self._x


class PoseSmoother:
    """Un `OneEuroFilter` por (grupo, clave, eje).

    `grupo` separa magnitudes distintas (metros 3D y coordenadas normalizadas 2D)
    para que no compartan estado.
    """

    def __init__(
        self,
        min_cutoff: float = 1.0,
        beta: float = 0.05,
        d_cutoff: float = 1.0,
    ) -> None:
        self.min_cutoff = min_cutoff
        self.beta = beta
        self.d_cutoff = d_cutoff
        self._filtros: dict[tuple[str, str, int], OneEuroFilter] = {}

    def reset(self) -> None:
        for filtro in self._filtros.values():
            filtro.reset()

    def _filtro(self, grupo: str, clave: str, eje: int) -> OneEuroFilter:
        clave_filtro = (grupo, clave, eje)
        filtro = self._filtros.get(clave_filtro)
        if filtro is None:
            filtro = OneEuroFilter(self.min_cutoff, self.beta, self.d_cutoff)
            self._filtros[clave_filtro] = filtro
        return filtro

    def apply(
        self,
        grupo: str,
        datos: Mapping[str, Sequence[float]],
        timestamp: float,
    ) -> dict[str, np.ndarray]:
        """Filtra cada componente y devuelve arreglos de numpy."""
        salida: dict[str, np.ndarray] = {}
        for clave, vector in datos.items():
            valores = [
                self._filtro(grupo, clave, eje).filter(float(componente), timestamp)
                for eje, componente in enumerate(vector)
            ]
            salida[clave] = np.asarray(valores, dtype=np.float64)
        return salida
