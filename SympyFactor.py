import time

from sympy.ntheory import factorint

start = time.time()
print(factorint(0x1ff0ff346ecf750b7ad8b76985e25833))
print('Took', time.time() - start, 'seconds.')
