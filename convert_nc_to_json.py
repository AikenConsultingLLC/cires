import scipy.io.netcdf as netcdf
import json
import numpy as np

# File path
nc_file_path = 'data/oe_m1m_dscovr_s20251204000000_e20251204235959_p20251205020036_pub.nc'
json_output_path = 'magnetic_data.json'

def convert_nc_to_json():
    try:
        # Open the NetCDF file
        # mmap=False is safer for some file versions
        f = netcdf.netcdf_file(nc_file_path, 'r', mmap=False)
        
        # Extract variables
        # Note: scipy.io.netcdf variables return data as .data attribute usually, 
        # or can be accessed directly if it's a simple array.
        # We also need to handle the fill values/missing values.
        
        # Helper to safely get data
        def get_data(var_name):
            var = f.variables[var_name]
            data = var.data.copy()
            # Handle missing values if defined
            # The header showed missing_value = -99999.
            missing_val = -99999.0
            
            # Simple list conversion with null for missing
            return [float(x) if x > -90000 else None for x in data]

        times = get_data('time')
        bx = get_data('bx_gsm')
        by = get_data('by_gsm')
        bz = get_data('bz_gsm')
        bt = get_data('bt')
        
        data_list = []
        
        for i in range(len(times)):
            # Skip if time is invalid, though unlikely here
            if times[i] is None:
                continue
                
            entry = {
                'time': times[i],
                'bx': bx[i],
                'by': by[i],
                'bz': bz[i],
                'bt': bt[i]
            }
            data_list.append(entry)
            
        # Write to JSON
        with open(json_output_path, 'w') as outfile:
            json.dump(data_list, outfile)
            
        print(f"Successfully converted {len(data_list)} records to {json_output_path}")
        f.close()

    except Exception as e:
        print(f"Error converting file: {e}")

if __name__ == "__main__":
    convert_nc_to_json()