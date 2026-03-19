import React, { useCallback, useState } from "react";
import {useDropzone} from "react-dropzone";
import { Box, Container, Typography } from "@mui/material";

function Home() {
const [files, setFiles] = useState([]);

const onDrop = useCallback((acceptedFiles) => {

setFiles((prev) => [...prev, ...acceptedFiles]);

console.log("Accepted files:", acceptedFiles);
}, []);

const {getRootProps, getInputProps, isDragActive} = useDropzone({
onDrop,

});

  return (
    <Container>
      <Typography variant="h3">
        Home Page
      </Typography>

      <Typography>
        Welcome to the site.
      </Typography>



<Box
{...getRootProps()}
style={{

border: "2px dashed #ccc",
 borderRadius: "8px",
   padding: "60px 20px",
  textAlign: "center",
   background: isDragActive ? "#f0f8ff" : "#fafafa",
   cursor: "pointer",

}}>


<input {...getInputProps()} />



{isDragActive ? (
  <Typography>Drop the files here</Typography>
) : (

  <Typography>Drag and Drop Files here, or click to select</Typography>
)}


</Box>




    </Container>



  );
}

export default Home;