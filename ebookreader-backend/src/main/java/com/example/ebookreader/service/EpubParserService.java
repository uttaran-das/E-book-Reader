package com.example.ebookreader.service;

import com.example.ebookreader.dto.EbookDto;
import org.springframework.stereotype.Service;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;
import org.xml.sax.SAXException;

import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

@Service
public class EpubParserService {

    public EbookDto parseEpub(String filePath) {
        EbookDto ebook = new EbookDto();

        try (ZipFile zipFile = new ZipFile(filePath)) {
            DocumentBuilder builder = DocumentBuilderFactory.newInstance().newDocumentBuilder();

            // container.xml
            ZipEntry containerEntry = zipFile.getEntry("META-INF/container.xml");
            Document containerDoc = builder.parse(zipFile.getInputStream(containerEntry));
            String opfPath = containerDoc.getElementsByTagName("rootfile").item(0).getAttributes()
                    .getNamedItem("full-path").getNodeValue();

            // .opf
            ZipEntry opfEntry = zipFile.getEntry(opfPath);
            Document opfDoc = builder.parse(zipFile.getInputStream(opfEntry));

            // metadata
            String title = opfDoc.getElementsByTagName("dc:title").item(0).getTextContent();
            String author = opfDoc.getElementsByTagName("dc:creator").item(0).getTextContent();
            ebook.setTitle(title);
            ebook.setAuthor(author);

            // manifest
            HashMap<String, String> map = new HashMap<>();
            NodeList manifestItems = opfDoc.getElementsByTagName("item");
            for (int i = 0; i < manifestItems.getLength(); i++) {
                Element item = (Element) manifestItems.item(i);
                map.put(item.getAttribute("id"), item.getAttribute("href"));
            }

            // spine
            ArrayList<String> readingOrder = new ArrayList<>();
            NodeList spineItems = opfDoc.getElementsByTagName("itemref");
            for (int i = 0; i < spineItems.getLength(); i++) {
                Element itemref = (Element) spineItems.item(i);
                readingOrder.add(map.get(itemref.getAttribute("idref")));
            }
            ebook.setSpine(readingOrder);
        } catch (IOException | ParserConfigurationException | SAXException e) {
            throw new RuntimeException(e);
        }
        return ebook;
    }

}
